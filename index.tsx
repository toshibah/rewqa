
export {};

// Since htmx and Chart.js are loaded from a CDN via <script> tags,
// they are not imported as modules. We need to declare them as globals
// to inform TypeScript that they exist.
declare var htmx: any;
declare var Chart: any;

// To attach our file upload handler to the window object and make it
// accessible to the inline `onsubmit` attribute in the HTML, we need
// to extend the global Window interface when in a module.
declare global {
  interface Window {
    handleFileUpload: (event: Event) => Promise<void>;
    selectTier: (tier: string) => void;
  }
}

// Wrap the entire script in a 'DOMContentLoaded' event listener.
// This is generally faster and more reliable than 'load' for app initialization.
window.addEventListener('DOMContentLoaded', () => {
  (async () => {
    try {
      // --- DYNAMIC IMPORT & INITIALIZATION ---
      const { GoogleGenAI, Type } = await import('@google/genai');

      const API_KEY = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;

      if (!API_KEY) {
        throw new Error("Configuration Error: API_KEY is not set. Please configure your environment.");
      }

      const ai = new GoogleGenAI({ apiKey: API_KEY });

      const analysisSchema = {
          type: Type.OBJECT,
          properties: {
              summary: { type: Type.OBJECT, properties: { totalCost: { type: Type.NUMBER }, potentialSavings: { type: Type.NUMBER }, topAnomalyService: { type: Type.STRING } } },
              narrative: { type: Type.STRING },
              costTrend: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { date: { type: Type.STRING }, cost: { type: Type.NUMBER }, anomaly: { type: Type.NUMBER, nullable: true } } } },
              anomalies: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { date: { type: Type.STRING }, description: { type: Type.STRING }, severity: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] }, estimatedImpact: { type: Type.NUMBER } } } },
              serviceBreakdown: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { service: { type: Type.STRING }, cost: { type: Type.NUMBER }, percentage: { type: Type.NUMBER } } } },
          },
      };

      // --- TIER SELECTION LOGIC ---
      const Tiers = ['Developer', 'Business', 'Enterprise'];
      const activeTierClasses = 'bg-cyan-500 text-slate-900';
      const inactiveTierClasses = 'bg-slate-700 hover:bg-slate-600 text-slate-300';

      function updateTierUI(selectedTier: string | null) {
        Tiers.forEach(tier => {
          const button = document.getElementById(`tier-btn-${tier}`);
          if (button) {
            const baseClasses = "tier-btn px-4 py-2 text-sm font-semibold rounded-md transition-colors";
            if (tier === selectedTier) {
              button.className = `${baseClasses} ${activeTierClasses}`;
            } else {
              button.className = `${baseClasses} ${inactiveTierClasses}`;
            }
          }
        });
      }

      window.selectTier = function(tier: string) {
        localStorage.setItem('selectedTier', tier);
        updateTierUI(tier);
      }

      // --- HTMX EVENT LISTENER FOR INITIALIZATION ---
      document.body.addEventListener('htmx:afterSwap', function() {
        // Check if the new content is the dashboard, which contains the tier buttons
        if (document.getElementById('tier-btn-Developer')) {
          const savedTier = localStorage.getItem('selectedTier');
          // Default to Business if no tier is saved
          const initialTier = savedTier && Tiers.includes(savedTier) ? savedTier : 'Business';
          if(!savedTier) {
            localStorage.setItem('selectedTier', initialTier);
          }
          updateTierUI(initialTier);
        }
      });


      // --- CORE APPLICATION LOGIC (only runs after successful init) ---

      async function analyzeCostData(csvData: string): Promise<any> {
        const prompt = `
          You are an expert Cloud Financial Operations (FinOps) analyst. Analyze the following cloud cost data (CSV format) and identify cost anomalies.
          
          CSV Data:
          \`\`\`csv
          ${csvData}
          \`\`\`
          
          Provide a complete analysis in JSON format including: a summary (totalCost, potentialSavings, topAnomalyService), a detailed narrative, costTrend data (with anomalies marked), a list of anomalies (with severity and impact), and a serviceBreakdown.
          
          Output ONLY the JSON object.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: analysisSchema,
            },
        });

        if (!response.text) {
            throw new Error("Received an empty response from the AI. Please try again.");
        }
        const jsonString = response.text.replace(/^```json\s*|```\s*$/g, '');
        return JSON.parse(jsonString);
      }

      function renderAnalysisHTML(data: any): string {
          const { summary, narrative, anomalies } = data;

          const severityStyles: { [key: string]: string } = {
              High: 'border-red-500 bg-red-900/20 text-red-400',
              Medium: 'border-amber-500 bg-amber-900/20 text-amber-400',
              Low: 'border-sky-500 bg-sky-900/20 text-sky-400',
          };

          const statCards = `
              <div class="grid md:grid-cols-3 gap-6">
                  <div class="bg-slate-800 p-6 rounded-lg border border-slate-700 flex items-start gap-4"><div class="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center bg-green-500/20 text-green-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></div><div><p class="text-sm text-slate-400">Total Cost</p><p class="text-2xl font-bold text-white">$${summary.totalCost.toLocaleString()}</p></div></div>
                  <div class="bg-slate-800 p-6 rounded-lg border border-slate-700 flex items-start gap-4"><div class="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center bg-cyan-500/20 text-cyan-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline></svg></div><div><p class="text-sm text-slate-400">Potential Savings</p><p class="text-2xl font-bold text-white">$${summary.potentialSavings.toLocaleString()}</p></div></div>
                  <div class="bg-slate-800 p-6 rounded-lg border border-slate-700 flex items-start gap-4"><div class="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center bg-amber-500/20 text-amber-400"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg></div><div><p class="text-sm text-slate-400">Top Anomaly Service</p><p class="text-2xl font-bold text-white">${summary.topAnomalyService}</p></div></div>
              </div>
          `;

          const narrativeHTML = narrative.split('\n').map((p: string) => `<p>${p}</p>`).join('');

          const anomalyCards = anomalies.map((anomaly: any) => `
              <div class="p-4 rounded-lg border ${severityStyles[anomaly.severity] || 'border-slate-600'}">
                  <div class="flex justify-between items-center"><span class="font-bold text-white">${anomaly.date}</span><span class="text-sm font-semibold px-2 py-0.5 rounded-full ${severityStyles[anomaly.severity]}">${anomaly.severity}</span></div>
                  <p class="text-slate-300 my-2">${anomaly.description}</p>
                  <p class="text-lg font-bold text-white text-right">Impact: $${anomaly.estimatedImpact.toLocaleString()}</p>
              </div>
          `).join('');

          return `
            <div class="space-y-6">
              ${statCards}
              <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700"><div class="flex items-center gap-3 mb-4"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-cyan-400"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg><h3 class="text-xl font-bold text-white">AI Narrative Analysis</h3></div><div class="prose prose-invert prose-p:text-slate-300 prose-strong:text-white max-w-none">${narrativeHTML}</div></div>
              <div class="grid lg:grid-cols-2 gap-6">
                  <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700"><h3 class="text-xl font-bold text-white mb-4">Cost Trend</h3><div class="h-[300px]"><canvas id="costChart"></canvas></div></div>
                  <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700"><h3 class="text-xl font-bold text-white mb-4">Spend by Service</h3><div class="h-[300px]"><canvas id="serviceChart"></canvas></div></div>
              </div>
              <div class="bg-slate-800/50 p-6 rounded-lg border border-slate-700"><h3 class="text-xl font-bold text-white mb-4">Detected Anomalies</h3><div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${anomalyCards}</div></div>
              <div class="text-center pt-6 flex items-center justify-center gap-4">
                <a href="/download-report" download="analyzed_cost_report.csv" class="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download CSV
                </a>
                <button hx-get="/dashboard.html" hx-target="#analysis-result" hx-swap="outerHTML" class="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M12 9v6"></path><path d="M9 12h6"></path></svg>
                  Analyze Another Report
                </button>
              </div>
            </div>
          `;
      }

      function initCharts(data: any) {
          const costChartCtx = (document.getElementById('costChart') as HTMLCanvasElement)?.getContext('2d');
          if (costChartCtx) {
              new Chart(costChartCtx, {
                  type: 'line',
                  data: {
                      labels: data.costTrend.map((d: any) => d.date),
                      datasets: [
                          { label: 'Cost', data: data.costTrend.map((d: any) => d.cost), borderColor: '#06b6d4', tension: 0.1, fill: false },
                          { label: 'Anomalies', data: data.costTrend.map((d: any) => d.anomaly || null), type: 'scatter', backgroundColor: '#f43f5e', pointRadius: 6, pointHoverRadius: 8 }
                      ]
                  },
                  options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } }, plugins: { legend: { labels: { color: '#cbd5e1' } } } }
              });
          }

          const serviceChartCtx = (document.getElementById('serviceChart') as HTMLCanvasElement)?.getContext('2d');
          if (serviceChartCtx) {
              const sortedServices = [...data.serviceBreakdown].sort((a: any, b: any) => b.cost - a.cost);
              new Chart(serviceChartCtx, {
                  type: 'bar',
                  data: {
                      labels: sortedServices.map((s: any) => s.service),
                      datasets: [{ label: 'Cost', data: sortedServices.map((s: any) => s.cost), backgroundColor: ['#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'], borderWidth: 0 }]
                  },
                  options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } }, plugins: { legend: { display: false } } }
              });
          }
      }

      // --- GLOBAL EVENT HANDLING ---
      window.handleFileUpload = async function(event: Event) {
          event.preventDefault();
          const form = event.target as HTMLFormElement;
          const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement;
          const file = fileInput.files?.[0];
          
          if (!file) {
              alert("Please select a file.");
              return;
          }
          
          const resultDiv = document.getElementById('analysis-result');
          const loader = document.getElementById('loader');
          const uploadForm = document.getElementById('upload-form');
          
          if (uploadForm) uploadForm.classList.add('hidden');
          if (loader) loader.classList.remove('hidden');

          try {
              const fileContent = await file.text();
              const analysisData = await analyzeCostData(fileContent);
              
              if (resultDiv) {
                  resultDiv.innerHTML = renderAnalysisHTML(analysisData);
                  htmx.process(resultDiv); 
                  initCharts(analysisData); 
              }

          } catch (err) {
              console.error(err);
              if (resultDiv) {
                  const error = err as Error;
                  resultDiv.innerHTML = `<div class="text-center p-8 bg-red-900/20 border border-red-500 rounded-lg"><h3 class="text-xl font-bold text-red-400">Analysis Failed</h3><p class="text-red-300 mt-2">${error.message}</p><button onclick="window.location.reload()" class="mt-4 bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-md transition-colors">Try Again</button></div>`;
              }
          } finally {
              if (loader) loader.classList.add('hidden');
          }
      }
      
      // --- APPLICATION START ---
      // All setup is complete. Trigger HTMX to load the initial content.
      htmx.trigger(document.body, "init-app");

    } catch (error) {
      console.error("Failed to initialize application:", error);
      const err = error as Error;
      const errorMessage = `Initialization Error: Failed to start the AI service. This could be due to a network issue or invalid configuration. Details: ${err.message}`;
      document.body.innerHTML = `<div class="bg-red-900 text-red-200 p-4"><strong>${errorMessage}</strong></div>`;
    }
  })();
});
