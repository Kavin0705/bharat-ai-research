import { useEffect, useState, type FormEvent } from "react";
import CivicPilot from "./CivicPilot";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Clock3,
  Command,
  FlaskConical,
  Gauge,
  GitBranch,
  HeartHandshake,
  Layers3,
  Languages,
  Moon,
  Play,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";
import { languages, translate, type Language } from "./i18n";

type Risk = "low" | "medium" | "high";
type Tab = "Civic pilot" | "Workbench" | "Evaluations";

type Scenario = {
  id: string;
  category: string;
  title: string;
  task: string;
  risk: Risk;
};

type RouteResult = {
  strategy: string;
  verification: boolean;
  reason: string;
  confidence: string;
  providerConnected: boolean;
  modelCalls: number;
};

const fallbackScenarios: Scenario[] = [
  { id: "fact-01", category: "Knowledge", title: "A direct fact", task: "What is the capital of India?", risk: "low" },
  { id: "summary-02", category: "Writing", title: "A short summary", task: "Summarize this report in three concise bullets.", risk: "low" },
  { id: "code-03", category: "Software", title: "A distributed failure", task: "Analyze a distributed service failure and trace its likely cause.", risk: "medium" },
  { id: "design-04", category: "Systems", title: "Compare architectures", task: "Compare two architectures and explain their operational trade-offs.", risk: "medium" },
  { id: "release-05", category: "Operations", title: "A production deployment", task: "Plan a production deployment with rollback and health checks.", risk: "high" },
  { id: "data-06", category: "Research", title: "Inspect a dataset", task: "Inspect this dataset for missing values and summarize any data-quality risks.", risk: "medium" },
  { id: "civic-07", category: "Civic services", title: "Navigate a public-service issue", task: "Analyze a non-emergency public-service issue and suggest a cautious, verifiable next step.", risk: "medium" },
  { id: "language-08", category: "Accessibility", title: "Explain a service in plain language", task: "Explain a public-service process in plain language and identify details that need official verification.", risk: "medium" },
];

const navItems: { label: Tab; icon: typeof Command }[] = [
  { label: "Civic pilot", icon: HeartHandshake },
  { label: "Workbench", icon: Command },
  { label: "Evaluations", icon: FlaskConical },
];

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = window.localStorage.getItem("bharat-ui-language");
      return languages.find((item) => item.code === saved)?.code ?? "en";
    } catch {
      return "en";
    }
  });
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = window.localStorage.getItem("bharat-ui-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [activeTab, setActiveTab] = useState<Tab>("Civic pilot");
  const [task, setTask] = useState("Analyze a distributed service failure and propose a verified fix.");
  const [risk, setRisk] = useState<Risk>("medium");
  const [scenarios, setScenarios] = useState(fallbackScenarios);
  const [apiOnline, setApiOnline] = useState(false);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = languages.find((item) => item.code === language)?.htmlLang ?? "en";
    try {
      window.localStorage.setItem("bharat-ui-theme", theme);
      window.localStorage.setItem("bharat-ui-language", language);
    } catch {
      // Preferences still apply for the current session when storage is unavailable.
    }
  }, [language, theme]);

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/health"), fetch("/api/scenarios")])
      .then(async ([healthResponse, scenariosResponse]) => {
        if (!healthResponse.ok || !scenariosResponse.ok) throw new Error("API unavailable");
        const health = await healthResponse.json();
        const scenarioData = await scenariosResponse.json();
        if (!active) return;
        setApiOnline(health.status === "ok");
        setScenarios(scenarioData.scenarios);
      })
      .catch(() => {
        if (active) setApiOnline(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setIsRouting(true);
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task, risk }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not route this task.");
      setResult(payload);
      setRunCount((count) => count + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The API could not be reached.");
    } finally {
      setIsRouting(false);
    }
  }

  function loadScenario(scenario: Scenario) {
    setTask(scenario.task);
    setRisk(scenario.risk);
    setActiveTab("Workbench");
    setResult(null);
    setError("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#workbench" onClick={() => setActiveTab("Workbench")} aria-label="Bharat AI Research home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-copy"><strong>BHARAT AI</strong><small>RESEARCH</small></span>
        </a>

        <div className="workspace-label">CIVIC AI RESEARCH</div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">B</span>
          <span><strong>Citizen pilot</strong><small>Local prototype</small></span>
          <ArrowDownRight size={14} aria-hidden="true" />
        </div>

        <div className="nav-caption">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activeTab === label ? "active" : ""}`}
              onClick={() => setActiveTab(label)}
              aria-current={activeTab === label ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{translate(language, label === "Civic pilot" ? "navCivic" : label === "Workbench" ? "navWorkbench" : "navEvaluations")}</span>
              {label === "Evaluations" && <span className="nav-count">{scenarios.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-status">
          <span className={`status-dot ${apiOnline ? "online" : "offline"}`} />
          <span>{apiOnline ? "Local API connected" : "API not connected"}</span>
          <span title="The API only previews routing policy. No model provider is connected."><CircleHelp size={15} /></span>
        </div>
        <a className="repo-link" href="https://github.com/Kavin0705/bharat-ai-research" target="_blank" rel="noreferrer">
          <GitBranch size={15} />
          <span>View repository</span>
          <ArrowUpRight size={14} />
        </a>
        <div className="sidebar-footer"><span className="flag-dot" /> Research build <span>v0.1.0</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Bharat AI</span><span className="crumb-slash">/</span><strong>{translate(language, activeTab === "Civic pilot" ? "navCivic" : activeTab === "Workbench" ? "navWorkbench" : "navEvaluations")}</strong></div>
          <div className="topbar-right">
            <span className="environment-label"><span className="status-dot online" /> {translate(language, "localEnvironment")}</span>
            <label className="preference-control language-control" title={translate(language, "language")}>
              <Languages size={15} aria-hidden="true" />
              <span className="sr-only">{translate(language, "language")}</span>
              <select value={language} onChange={(event) => {
                const selected = languages.find((item) => item.code === event.target.value);
                if (selected) setLanguage(selected.code);
              }} aria-label={translate(language, "language")}>
                {languages.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}
              </select>
            </label>
            <button className="preference-control theme-toggle" type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={translate(language, theme === "dark" ? "lightMode" : "darkMode")} title={translate(language, theme === "dark" ? "lightMode" : "darkMode")}>
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="icon-button" title="Research notes" aria-label="Research notes" onClick={() => setActiveTab("Evaluations")}><CircleHelp size={17} /></button>
            <details className="profile-menu">
              <summary className="user-avatar" aria-label={translate(language, "profileDetails")}>G</summary>
              <section className="profile-popover" aria-labelledby="profile-heading">
                <div className="profile-popover-heading">
                  <span className="user-avatar profile-avatar">G</span>
                  <div><strong id="profile-heading">{translate(language, "guestContributor")}</strong><small>{translate(language, "notSignedIn")}</small></div>
                </div>
                <p>{translate(language, "profileNoAccount")}</p>
                <dl>
                  <div><dt>{translate(language, "pilotRegion")}</dt><dd>India</dd></div>
                  <div><dt>{translate(language, "interfaceLanguage")}</dt><dd>{languages.find((item) => item.code === language)?.nativeName}</dd></div>
                  <div><dt>{translate(language, "appearance")}</dt><dd>{theme === "dark" ? translate(language, "darkLabel") : translate(language, "lightLabel")}</dd></div>
                </dl>
                <small>{translate(language, "profileVotePrivacy")}</small>
              </section>
            </details>
          </div>
        </header>

        <div hidden={activeTab !== "Civic pilot"}>
          <CivicPilot language={language} />
        </div>
        <div hidden={activeTab !== "Workbench"}>
          <Workbench
            apiOnline={apiOnline}
            error={error}
            isRouting={isRouting}
            onRoute={handleRoute}
            onTaskChange={setTask}
            onRiskChange={setRisk}
            result={result}
            risk={risk}
            runCount={runCount}
            scenarios={scenarios}
            task={task}
            onLoadScenario={loadScenario}
            onOpenEvaluations={() => setActiveTab("Evaluations")}
          />
        </div>
        <div hidden={activeTab !== "Evaluations"}>
          <Evaluations scenarios={scenarios} onLoadScenario={loadScenario} />
        </div>
      </main>
    </div>
  );
}

type WorkbenchProps = {
  apiOnline: boolean;
  error: string;
  isRouting: boolean;
  onRoute: (event: FormEvent<HTMLFormElement>) => void;
  onTaskChange: (task: string) => void;
  onRiskChange: (risk: Risk) => void;
  result: RouteResult | null;
  risk: Risk;
  runCount: number;
  scenarios: Scenario[];
  task: string;
  onLoadScenario: (scenario: Scenario) => void;
  onOpenEvaluations: () => void;
};

function Workbench({
  apiOnline,
  error,
  isRouting,
  onRoute,
  onTaskChange,
  onRiskChange,
  result,
  risk,
  runCount,
  scenarios,
  task,
  onLoadScenario,
  onOpenEvaluations,
}: WorkbenchProps) {
  return (
    <div className="page-wrap">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-rule" /> RESEARCH CONSOLE</div>
          <h1>Intelligence, <em>measured.</em></h1>
          <p>Explore how much reasoning a task needs. Every result starts with a baseline, not a claim.</p>
        </div>
        <div className="heading-actions"><span className="build-badge"><span className="status-dot online" /> PROTOTYPE</span></div>
      </section>

      <section className="metrics-grid" aria-label="Project metrics">
        <Metric icon={<Layers3 size={16} />} label="Evaluation scenarios" value={String(scenarios.length).padStart(2, "0")} caption="Fixed starter suite" accent="saffron" />
        <Metric icon={<Activity size={16} />} label="Local policy runs" value={String(runCount).padStart(2, "0")} caption="This session" accent="green" />
        <Metric icon={<Gauge size={16} />} label="Quality / cost / time" value="—" caption="Not measured yet" accent="blue" />
        <Metric icon={<Zap size={16} />} label="Model providers" value="00" caption="None connected" accent="coral" />
      </section>

      <div className="workbench-grid">
        <section className="panel task-panel">
          <div className="panel-heading">
            <div><span className="step-label">01 / ROUTING EXPERIMENT</span><h2>Give the engine a task</h2></div>
            <span className="panel-icon"><Sparkles size={17} /></span>
          </div>
          <form onSubmit={onRoute}>
            <label className="field-label" htmlFor="task-input">TASK PROMPT</label>
            <textarea id="task-input" value={task} onChange={(event) => onTaskChange(event.target.value)} maxLength={2000} placeholder="Describe the task you want to evaluate..." required />
            <div className="field-meta"><span>Keep the task identical across strategies for a fair comparison.</span><span>{task.length}/2000</span></div>

            <div className="risk-row">
              <div><span className="field-label">IMPACT LEVEL</span><span className="risk-hint">Higher impact warrants more verification.</span></div>
              <div className="segmented-control" role="group" aria-label="Task impact level">
                {(["low", "medium", "high"] as Risk[]).map((level) => (
                  <button type="button" className={risk === level ? `selected ${level}` : ""} key={level} onClick={() => onRiskChange(level)} aria-pressed={risk === level}>{level}</button>
                ))}
              </div>
            </div>

            <div className="form-footer">
              <span className="model-note"><span className="status-dot offline" /> Policy preview · no model call</span>
              <button className="primary-button" type="submit" disabled={!apiOnline || isRouting || !task.trim()}>
                {isRouting ? <><span className="spinner" /> Evaluating</> : <><Play size={15} fill="currentColor" /> Preview route</>}
              </button>
            </div>
          </form>
          {error && <div className="error-banner" role="alert">{error}</div>}
          {!apiOnline && <div className="offline-banner"><span className="status-dot offline" /> Start the local API with <code>npm run api</code> to preview routes.</div>}
        </section>

        <section className={`panel result-panel ${result ? "has-result" : ""}`} aria-live="polite">
          <div className="panel-heading">
            <div><span className="step-label">02 / POLICY PREVIEW</span><h2>{result ? "Recommended strategy" : "Your result will appear here"}</h2></div>
            <span className="result-icon"><ShieldCheck size={18} /></span>
          </div>
          {result ? (
            <>
              <div className="strategy-card">
                <div className="strategy-topline"><span>ROUTING POLICY</span><span className="rule-pill"><span className="status-dot" /> RULE-BASED</span></div>
                <div className="strategy-name">{formatStrategy(result.strategy)}</div>
                <p>{result.reason}</p>
                <div className="strategy-divider" />
                <div className="strategy-details">
                  <div><span>VERIFICATION</span><strong>{result.verification ? "Recommended" : "Not added"}</strong></div>
                  <div><span>MODEL CALLS</span><strong>{result.modelCalls}</strong></div>
                </div>
              </div>
              <div className="honesty-note"><CircleHelp size={15} /><span>This is a routing preview only. No model ran; quality, latency, and cost are not measured.</span></div>
            </>
          ) : (
            <div className="empty-result">
              <div className="empty-orbit"><span /><span /><Sparkles size={21} /></div>
              <p>Submit a task to see the current routing rule and its verification recommendation.</p>
              <span className="empty-caption">NO INFERENCE PROVIDER CONNECTED</span>
            </div>
          )}
          <div className="result-foot"><span><Clock3 size={14} /> Timing starts after model integration</span><span className="confidence">Confidence: rule-based</span></div>
        </section>
      </div>

      <section className="scenario-section">
        <div className="section-heading">
          <div><span className="step-label">STARTER BENCHMARK</span><h2>Scenarios to explore</h2></div>
          <button className="text-button" onClick={onOpenEvaluations}>View all <ArrowRight size={15} /></button>
        </div>
        <div className="scenario-strip">
          {scenarios.slice(0, 3).map((scenario, index) => (
            <button className="scenario-card" key={scenario.id} onClick={() => onLoadScenario(scenario)}>
              <span className="scenario-index">0{index + 1}</span>
              <span className="scenario-content"><span className="scenario-category">{scenario.category}</span><strong>{scenario.title}</strong><small>{scenario.task}</small></span>
              <ArrowUpRight className="scenario-arrow" size={16} />
            </button>
          ))}
        </div>
      </section>

      <footer className="page-footnote"><span>Research prototype · v0.1.0</span><span>Measure first. Optimize second.</span><span className={apiOnline ? "foot-online" : "foot-offline"}><span className="status-dot" /> {apiOnline ? "API ready" : "API offline"}</span></footer>
    </div>
  );
}

function Metric({ icon, label, value, caption, accent }: { icon: React.ReactNode; label: string; value: string; caption: string; accent: string }) {
  return <article className={`metric-card ${accent}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span></div><div className="metric-bottom"><strong>{value}</strong><span>{caption}</span></div></article>;
}

function Evaluations({ scenarios, onLoadScenario }: { scenarios: Scenario[]; onLoadScenario: (scenario: Scenario) => void }) {
  return (
    <div className="page-wrap evaluations-page">
      <section className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-rule" /> EXPERIMENT DESIGN</div><h1>Evaluation <em>suite.</em></h1><p>A fixed starter set for comparing task strategies. No scores are fabricated.</p></div>
        <div className="heading-actions"><span className="suite-count"><FlaskConical size={15} /> {String(scenarios.length).padStart(2, "0")} SCENARIOS</span></div>
      </section>

      <section className="evaluation-summary">
        <div className="summary-mark"><Layers3 size={20} /></div>
        <div className="summary-copy"><span className="step-label">BASELINE STATUS</span><h2>Ready for first measured run</h2><p>Scenarios are defined; model adapters and scoring criteria still need to be connected.</p></div>
        <div className="summary-state"><span className="status-dot offline" /> NOT RUN</div>
      </section>

      <div className="table-toolbar"><div><span className="table-title">Scenario set</span><span className="table-subtitle">v0.1 · deterministic prompts</span></div><span className="table-subtitle">Click a row to load it into the workbench</span></div>
      <div className="scenario-table-wrap">
        <table className="scenario-table">
          <thead><tr><th>SCENARIO</th><th>CATEGORY</th><th>IMPACT</th><th>STATUS</th><th aria-label="Load scenario" /></tr></thead>
          <tbody>
            {scenarios.map((scenario, index) => (
              <tr key={scenario.id} onClick={() => onLoadScenario(scenario)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onLoadScenario(scenario); }}>
                <td><span className="row-index">0{index + 1}</span><span className="scenario-title-cell"><strong>{scenario.title}</strong><small>{scenario.task}</small></span></td>
                <td><span className="category-tag">{scenario.category}</span></td>
                <td><span className={`risk-tag ${scenario.risk}`}>{scenario.risk}</span></td>
                <td><span className="not-run"><span className="status-dot offline" /> Not measured</span></td>
                <td><ArrowUpRight size={15} className="table-arrow" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="evaluation-note"><div className="note-icon"><Check size={16} /></div><p><strong>Reproducibility note</strong> Keep prompts, model versions, decoding settings, and scoring rules fixed when comparing routing strategies.</p></div>
      <footer className="page-footnote"><span>Research prototype · v0.1.0</span><span>Evaluation before optimization</span><span><ArrowUpRight size={13} /> 0 completed runs</span></footer>
    </div>
  );
}

function formatStrategy(strategy: string) {
  return strategy.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

export default App;