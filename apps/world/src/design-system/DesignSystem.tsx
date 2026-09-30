import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Compass,
  Copy,
  Database,
  FlaskConical,
  Layers2,
  Menu,
  Monitor,
  Moon,
  MousePointer2,
  Move,
  Palette,
  Plus,
  Sprout,
  Sun,
  Users,
  X,
} from "lucide-react";
import {
  AgentCard,
  Button,
  IconButton,
  Notice,
  Panel,
  RobotAvatar,
  SourceBadge,
  StatusBadge,
  statusDefinition,
  type Status,
  type Theme,
} from "./components";
import tokensCss from "./tokens.css?raw";
import "./showcase.css";

type ThemePreference = Theme | "system";
const sections = [
  ["overview", "Overview", "00"],
  ["foundations", "Foundations", "01"],
  ["components", "Components", "02"],
  ["patterns", "Product patterns", "03"],
  ["world", "World & motion", "04"],
] as const;
const demoAgents = [
  {
    name: "Moss",
    color: "stone",
    detail: "Frontend · Claude Code",
    task: "Building the navigation",
    status: "working",
  },
  {
    name: "Pip",
    color: "clay",
    detail: "API · Codex",
    task: "Waiting for a design decision",
    status: "needs-input",
  },
  {
    name: "Orbit",
    color: "lavender",
    detail: "Tests · Claude Code",
    task: "Layout checks are complete",
    status: "completed",
  },
] as const;

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem("crewhub.design-system.theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* A theme still works when browser storage is unavailable. */
  }
  return "system";
}

function SectionHeading({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: string;
}) {
  return (
    <header className="ds-section-heading">
      <div>
        <span className="ds-section-number">{number}</span>
        <h2>{title}</h2>
      </div>
      <p>{children}</p>
    </header>
  );
}

function MaterialStudy() {
  return (
    <svg
      className="ds-material-art"
      viewBox="0 0 500 320"
      role="img"
      aria-label="Isometric material study with chalk walls, timber furniture, green planting and warm light"
    >
      <defs>
        <pattern
          id="study-grid"
          width="48"
          height="28"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 14 24 0 48 14 24 28Z"
            fill="none"
            stroke="var(--ch-border)"
            strokeWidth=".6"
          />
        </pattern>
      </defs>
      <rect width="500" height="320" fill="url(#study-grid)" />
      <ellipse
        cx="251"
        cy="253"
        rx="166"
        ry="33"
        fill="var(--ch-ink)"
        opacity=".07"
      />
      <path d="M72 186 250 87 427 186 250 288Z" fill="var(--ch-scene-ground)" />
      <path
        d="M72 186 250 288 427 186 427 198 250 301 72 198Z"
        fill="var(--ch-scene-ground)"
      />
      <path
        d="M72 186 250 288 427 186 427 198 250 301 72 198Z"
        fill="#000"
        opacity=".09"
      />
      <path d="M126 165 254 94 376 163 247 237Z" fill="var(--ch-scene-wall)" />
      <path d="M126 165 126 82 254 12 254 94Z" fill="var(--ch-scene-wall)" />
      <path d="M254 12 376 82 376 163 254 94Z" fill="var(--ch-scene-wall)" />
      <path d="M254 12 376 82 376 163 254 94Z" fill="#000" opacity=".10" />
      <path
        d="M149 127 149 88 183 69 183 108Z"
        fill="var(--ch-scene-water)"
        stroke="var(--ch-scene-wood)"
        strokeWidth="5"
      />
      <path
        d="M166 79 166 116M149 108 183 89"
        stroke="var(--ch-scene-wood)"
        strokeWidth="3"
      />
      <path d="M215 140 288 98 338 127 265 170Z" fill="var(--ch-scene-wood)" />
      <path
        d="M220 144V177M265 171V204M332 132V165"
        stroke="var(--ch-scene-wood)"
        strokeWidth="5"
      />
      <path
        d="M264 122 264 88 297 106 297 140Z"
        fill="var(--ch-ink)"
        stroke="var(--ch-scene-wood)"
        strokeWidth="3"
      />
      <path
        d="M271 104 287 113M271 112 292 124"
        stroke="var(--ch-scene-light)"
        strokeWidth="2"
      />
      <path d="M268 143 290 130 303 138 281 151Z" fill="var(--ch-canvas)" />
      <ellipse
        cx="221"
        cy="196"
        rx="25"
        ry="14"
        fill="var(--ch-scene-water)"
        opacity=".75"
      />
      <path d="M221 190V159" stroke="var(--ch-ink-secondary)" strokeWidth="4" />
      <path d="M204 166 221 156 239 167 221 178Z" fill="var(--ch-accent)" />
      <path d="M204 166V146Q221 126 239 146V167" fill="var(--ch-accent)" />
      <path d="M332 74V27" stroke="var(--ch-ink-secondary)" strokeWidth="2" />
      <ellipse cx="332" cy="77" rx="21" ry="9" fill="var(--ch-scene-light)" />
      <ellipse
        cx="332"
        cy="144"
        rx="34"
        ry="17"
        fill="var(--ch-scene-light)"
        opacity=".20"
      />
      {[
        { x: 110, y: 206, s: 1.0 },
        { x: 374, y: 207, s: 1.15 },
        { x: 185, y: 247, s: 0.7 },
      ].map(({ x, y, s }) => (
        <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cy="8" rx="17" ry="8" fill="var(--ch-ink)" opacity=".08" />
          <path d="M-12-9-9 11Q0 20 9 11L12-9" fill="var(--ch-scene-wood)" />
          <ellipse cy="-9" rx="12" ry="6" fill="var(--ch-ink-secondary)" />
          <path d="M0-10V-47" stroke="var(--ch-scene-foliage)" strokeWidth="3" />
          <ellipse
            cx="-7"
            cy="-31"
            rx="9"
            ry="18"
            transform="rotate(-35 -7 -31)"
            fill="var(--ch-scene-foliage)"
          />
          <ellipse
            cx="8"
            cy="-41"
            rx="9"
            ry="20"
            transform="rotate(28 8 -41)"
            fill="var(--ch-scene-foliage)"
          />
          <ellipse
            cx="8"
            cy="-23"
            rx="7"
            ry="14"
            transform="rotate(48 8 -23)"
            fill="var(--ch-scene-foliage)"
          />
        </g>
      ))}
    </svg>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  const [selected, setSelected] = useState(0);
  const [activity, setActivity] = useState(false);
  const agent = demoAgents[selected]!;
  return (
    <div className="ds-theme-preview" data-crew-theme={theme}>
      <div className="ds-preview-top">
        <span>
          {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "light" ? "Daylight" : "Lamplight"}
        </span>
        <span>Local demo</span>
      </div>
      <div className="ds-preview-body">
        <div className="ds-preview-location">
          <span>
            <Monitor size={16} />
            Frontend
          </span>
          <SourceBadge source="3 companions" />
        </div>
        <div
          className="ds-preview-crew"
          aria-label={`${theme} theme sample crew`}
        >
          {demoAgents.map((a, i) => (
            <button
              key={a.name}
              className="ds-avatar-pick"
              aria-label={`Select ${a.name} in ${theme} preview`}
              aria-pressed={selected === i}
              onClick={() => {
                setSelected(i);
                setActivity(false);
              }}
            >
              <RobotAvatar color={a.color} size={40} />
              <span>{a.name}</span>
            </button>
          ))}
        </div>
        <div className="ds-preview-detail">
          <div>
            <strong>{agent.name}</strong>
            <StatusBadge status={agent.status} />
          </div>
          <p>{agent.task}</p>
          <SourceBadge source={agent.detail.split(" · ")[1]!} />
        </div>
        <Button onClick={() => setActivity(!activity)} aria-expanded={activity}>
          {activity ? "Hide" : "View"} sample activity{" "}
          <ArrowUpRight size={14} />
        </Button>
        {activity && (
          <p className="ds-inline-result">
            <Check size={14} />
            Sample event: {agent.task.toLowerCase()}. No live session.
          </p>
        )}
      </div>
    </div>
  );
}

export default function DesignSystem() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [roomName, setRoomName] = useState("Frontend");
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [gentle, setGentle] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [tool, setTool] = useState("Select");
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
  const invalidName = saveAttempted && !roomName.trim();

  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("crewhub.design-system.theme", preference);
    } catch {
      /* Session-only fallback. */
    }
  }, [preference]);
  useEffect(() => {
    document.title = "CrewHub · Design system";
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (dialogOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!dialogOpen && dialog.current?.open) dialog.current?.close();
  }, [dialogOpen]);

  function announce(message: string) {
    setNotice(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 5000);
  }
  function downloadTokens() {
    const url = URL.createObjectURL(
      new Blob([tokensCss], { type: "text/css" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "crewhub-tokens.css";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("Light and dark CSS tokens downloaded.");
  }
  async function copyToken(name: string, element: HTMLElement) {
    const value = getComputedStyle(element).getPropertyValue(name).trim();
    try {
      await navigator.clipboard.writeText(`${name}: ${value};`);
      announce(`Copied ${name}: ${value}`);
    } catch {
      announce(`${name}: ${value}. Clipboard access is unavailable.`);
    }
  }

  return (
    <div className="ds-root" data-crew-theme={theme}>
      <a className="ds-skip" href="#design-content">
        Skip to content
      </a>
      <header className="ds-header">
        <a href="#overview" className="ds-brand">
          <span>
            <Box size={23} />
          </span>
          CrewHub
          <span className="ds-brand-divider" /> <small>Design system</small>
        </a>
        <div className="ds-header-right">
          <span className="ds-version">FIELD GUIDE / 0.1</span>
          <div
            className="ds-theme-switch"
            role="group"
            aria-label="Color theme"
          >
            {(
              [
                { id: "light", label: "Light", icon: Sun },
                { id: "dark", label: "Dark", icon: Moon },
                { id: "system", label: "System", icon: Monitor },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-label={`${label} theme`}
                aria-pressed={preference === id}
                onClick={() => setPreference(id)}
                title={`${label} theme`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <IconButton
            className="ds-menu-button"
            label={mobileNav ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
          >
            {mobileNav ? <X size={18} /> : <Menu size={18} />}
          </IconButton>
        </div>
      </header>
      <aside className={`ds-sidebar ${mobileNav ? "is-open" : ""}`}>
        <div>
          <p className="ds-overline">THE CREWHUB LANGUAGE</p>
          <nav aria-label="Design system sections">
            {sections.map(([id, label, number]) => (
              <a href={`#${id}`} key={id} onClick={() => setMobileNav(false)}>
                <span>{label}</span>
                <small>{number}</small>
              </a>
            ))}
          </nav>
        </div>
        <div className="ds-sidebar-bottom">
          <Sprout size={25} />
          <p>
            A calmer way
            <br />
            to build together.
          </p>
          <a href="/">
            Open The Greenhouse <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>
      <main id="design-content" className="ds-main">
        <section id="overview" className="ds-overview">
          <div className="ds-breadcrumb">
            CrewHub <ChevronRight size={13} /> Foundations for a little world
          </div>
          <div className="ds-hero">
            <div className="ds-hero-copy">
              <div className="ds-overline">
                <i /> WORLD FIRST. PEOPLE ALWAYS.
              </div>
              <h1>
                Warm by day.
                <br />
                <span>Calm after dark.</span>
              </h1>
              <p>
                A considered language for your crew’s little world. Warm
                surfaces, warm neutrals, quiet controls, and just enough
                personality.
              </p>
              <div className="ds-hero-actions">
                <a href="#components" className="ch-button ch-button--primary">
                  Explore the components <ArrowRight size={15} />
                </a>
                <Button variant="ghost" onClick={downloadTokens}>
                  <ArrowDownToLine size={15} />
                  Get tokens
                </Button>
              </div>
              <div className="ds-hero-meta">
                <span>02 color modes</span>
                <span>01 shared language</span>
              </div>
            </div>
            <div className="ds-study">
              <div className="ds-study-caption">
                <span>
                  <Sprout size={15} /> World material study
                </span>
                <span>
                  {theme === "light" ? "01 / DAYLIGHT" : "02 / LAMPLIGHT"}
                </span>
              </div>
              <MaterialStudy />
              <div className="ds-floating-label">
                <RobotAvatar size={34} />
                <div>
                  <strong>A little room to focus.</strong>
                  <span>Chalk · timber · glass · greenery</span>
                </div>
              </div>
            </div>
          </div>
          <div className="ds-principles">
            <div>
              <span>01</span>
              <strong>The world leads.</strong>
              <p>Controls frame the scene and leave room to explore.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Soft edges. Clear signals.</strong>
              <p>Gentle materials, legible text, and unmistakable states.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Same place, different light.</strong>
              <p>Dark mode changes the atmosphere, never the meaning.</p>
            </div>
          </div>
        </section>

        <section id="foundations" className="ds-section">
          <SectionHeading number="01" title="Foundations">
            A warm neutral base. A graphite accent. Color with a job to do.
          </SectionHeading>
          <div className="ds-subheading">
            <h3>The everyday palette</h3>
            <span>Click a swatch to copy its token</span>
          </div>
          <div className="ds-swatches">
            {[
              ["Canvas", "--ch-canvas", "The open world"],
              ["Surface", "--ch-surface", "Panels & cards"],
              ["Ink", "--ch-ink", "Primary content"],
              ["Graphite", "--ch-accent", "Action & selection"],
              ["Amber", "--ch-attention", "A little attention"],
              ["Lilac", "--ch-complete", "Explicit completion"],
            ].map(([label, token, description]) => (
              <button
                className="ds-swatch"
                key={token}
                onClick={(e) => void copyToken(token!, e.currentTarget)}
                aria-label={`Copy ${label} token`}
              >
                <span
                  className="ds-swatch-color"
                  style={{ background: `var(${token})` }}
                >
                  <Copy size={14} />
                </span>
                <span className="ds-swatch-label">
                  <strong>{label}</strong>
                  <small>{description}</small>
                  <code>{token}</code>
                </span>
              </button>
            ))}
          </div>
          <div className="ds-foundation-grid">
            <Panel className="ds-type-panel">
              <div className="ds-overline">TYPOGRAPHY / SYSTEM SANS</div>
              <p className="ds-type-display">
                A place for
                <br />
                good company.
              </p>
              <p className="ds-type-body">
                Readable at a glance. Friendly up close. The interface stays
                precise while the world brings the charm.
              </p>
              <div className="ds-type-scale">
                <span>
                  <b>Aa</b>Display · 36–56
                </span>
                <span>
                  <b>Aa</b>Title · 24
                </span>
                <span>
                  <b>Aa</b>Body · 14
                </span>
                <span>
                  <code>Aa</code>Code · 12
                </span>
              </div>
            </Panel>
            <Panel className="ds-rhythm-panel">
              <div className="ds-overline">SPACE, SHAPE & DEPTH</div>
              <h3>A little breathing room.</h3>
              <div className="ds-spacing">
                {[4, 8, 12, 16, 24, 32, 48].map((n) => (
                  <div key={n}>
                    <span style={{ height: n }} />
                    <code>{n}</code>
                  </div>
                ))}
              </div>
              <div className="ds-radius-row">
                {[8, 12, 18, 24].map((n) => (
                  <div key={n}>
                    <span style={{ borderRadius: n }} />
                    <code>{n}px</code>
                  </div>
                ))}
              </div>
              <p>44px controls · 1px borders · 2px focus ring</p>
              <span className="ds-small-note">
                Use elevation for floating controls. Keep content surfaces
                quiet.
              </span>
            </Panel>
          </div>
          <div className="ds-subheading ds-theme-heading">
            <h3>Two modes. The same companion.</h3>
            <span>Try selecting a different agent</span>
          </div>
          <div className="ds-theme-pair">
            <ThemePreview theme="light" />
            <ThemePreview theme="dark" />
          </div>
        </section>

        <section id="components" className="ds-section">
          <SectionHeading number="02" title="The component kit">
            Familiar controls, with enough warmth to feel at home.
          </SectionHeading>
          <div className="ds-component-grid">
            <Panel>
              <div className="ds-panel-label">
                <h3>Actions</h3>
                <span>01 / BUTTONS</span>
              </div>
              <div className="ds-button-row">
                <Button variant="primary" onClick={() => setDialogOpen(true)}>
                  <Plus size={15} />
                  New room
                </Button>
                <Button onClick={downloadTokens}>
                  <ArrowDownToLine size={15} />
                  Export tokens
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    announce("This is a preview of a quiet, secondary action.")
                  }
                >
                  Quiet action <ArrowUpRight size={14} />
                </Button>
              </div>
              <div className="ds-button-row">
                <Button disabled>Unavailable</Button>
                <Button
                  variant="danger"
                  onClick={() => announce("Preview only. No room was removed.")}
                >
                  Remove room
                </Button>
                <IconButton
                  label="Show focus guidance"
                  onClick={() =>
                    announce(
                      "Keyboard focus uses a 2px ring with a 4px offset. Try Tab to explore.",
                    )
                  }
                >
                  <Compass size={18} />
                </IconButton>
              </div>
              <p className="ds-component-caption">
                One primary action per context. Destructive actions name the
                consequence.
              </p>
            </Panel>
            <Panel>
              <div className="ds-panel-label">
                <h3>Status language</h3>
                <span>02 / BADGES</span>
              </div>
              <div className="ds-status-list">
                {(Object.keys(statusDefinition) as Status[]).map((status) => (
                  <StatusBadge key={status} status={status} />
                ))}
              </div>
              <p className="ds-component-caption">
                Icon + label + tone. Freshness, attention, and completion keep
                their own meaning.
              </p>
            </Panel>
            <Panel>
              <div className="ds-panel-label">
                <h3>Inputs & preferences</h3>
                <span>03 / FORMS</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSaveAttempted(true);
                  if (roomName.trim())
                    announce(
                      `Preview saved: ${roomName.trim()}. No town was changed.`,
                    );
                }}
              >
                <label className="ch-field" htmlFor="sample-room-name">
                  Room name
                  <input
                    id="sample-room-name"
                    className="ch-input"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    aria-invalid={invalidName}
                    aria-describedby="room-name-help"
                    maxLength={40}
                  />
                  <span
                    id="room-name-help"
                    className={invalidName ? "ch-field-error" : "ch-field-hint"}
                  >
                    {invalidName
                      ? "Give this room a name before saving."
                      : "A familiar name for a shared place. Up to 40 characters."}
                  </span>
                </label>
                <div className="ds-form-bottom">
                  <label className="ch-switch">
                    <input
                      type="checkbox"
                      checked={gentle}
                      onChange={(e) => setGentle(e.target.checked)}
                    />
                    Gentle motion preview
                  </label>
                  <Button type="submit">Save preview</Button>
                </div>
              </form>
            </Panel>
            <Panel>
              <div className="ds-panel-label">
                <h3>Your companions</h3>
                <span>04 / AGENT CARDS</span>
              </div>
              <div className="ds-agent-list">
                {demoAgents.map((agent, i) => (
                  <AgentCard
                    key={agent.name}
                    {...agent}
                    selected={i === selectedAgent}
                    onClick={() => setSelectedAgent(i)}
                  />
                ))}
              </div>
              <p className="ds-component-caption">
                Identity colors belong to characters. Status colors describe
                activity.
              </p>
            </Panel>
          </div>
          <Panel className="ds-toolbar-panel">
            <div>
              <h3>A toolbar that leaves space.</h3>
              <p>Grouped tools, clear selection, comfortable targets.</p>
            </div>
            <div
              className="ds-toolstrip"
              role="group"
              aria-label="Sample room tool"
            >
              {[
                { name: "Select", icon: MousePointer2 },
                { name: "Move", icon: Move },
                { name: "Build", icon: Box },
                { name: "Agents", icon: Users },
              ].map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  aria-pressed={tool === name}
                  onClick={() => setTool(name)}
                >
                  <Icon size={20} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
            <span className="ds-tool-description" role="status">
              {tool} tool selected · preview only
            </span>
          </Panel>
        </section>

        <section id="patterns" className="ds-section">
          <SectionHeading number="03" title="Built for the town">
            Patterns for rooms, sources, and the moments that need a little
            care.
          </SectionHeading>
          <div className="ds-pattern-grid">
            <Panel className="ds-room-nav">
              <div className="ds-panel-label">
                <h3>Spaces</h3>
                <SourceBadge source="Mock town" />
              </div>
              <div className="ds-room-row selected">
                <Monitor size={18} />
                <strong>Frontend</strong>
                <StatusBadge status="working">2 working</StatusBadge>
              </div>
              <div className="ds-room-row">
                <Database size={18} />
                <strong>API</strong>
                <StatusBadge status="needs-input">1 needs you</StatusBadge>
              </div>
              <div className="ds-room-row">
                <FlaskConical size={18} />
                <strong>Tests</strong>
                <StatusBadge status="idle" />
              </div>
              <div className="ds-room-footer">
                <span>Personal / 3 rooms</span>
                <span>Room overview specimen</span>
              </div>
            </Panel>
            <Panel className="ds-detail-specimen">
              <div className="ds-panel-label">
                <h3>At a glance</h3>
                <span>SIMULATED ACTIVITY</span>
              </div>
              <div className="ds-detail-person">
                <RobotAvatar color="clay" size={52} />
                <div>
                  <h3>Pip</h3>
                  <span>The thoughtful problem-solver</span>
                </div>
                <StatusBadge status="needs-input" />
              </div>
              <div className="ds-task">
                <span>CURRENT TASK</span>
                <p>Choose the navigation structure</p>
              </div>
              <div className="ds-source-row">
                <SourceBadge source="Codex" />
                <SourceBadge source="via Herdr" />
                <span>One session, two source labels</span>
              </div>
              <p className="ds-component-caption">
                A provider tells you where activity comes from. It does not
                decide which room you belong to.
              </p>
            </Panel>
          </div>
          <div className="ds-state-grid">
            <Notice title="Connection lost">
              Keep the last observation visible and dated. Show “Last known:
              working” instead of implying an idle session.
            </Notice>
            <Notice tone="attention" title="This room is full">
              Keep existing furniture in place. Offer a capacity preview before
              committing to more space.
            </Notice>
            <Notice title="A place is waiting">
              An unassigned session needs a destination. Suggest a room and let
              the person choose.
            </Notice>
          </div>
          <div className="ds-contract">
            <Check size={17} />
            <p>
              Empty is a known state. Unavailable is missing information. Show
              the difference in words.
            </p>
          </div>
        </section>

        <section id="world" className="ds-section">
          <SectionHeading number="04" title="The world behind the interface">
            Botanical miniature architecture, grounded in the reference you
            shared.
          </SectionHeading>
          <figure className="ds-reference">
            <img
              src="/design-system/town-reference.png"
              alt="User-provided CrewHub reference: a light isometric town with Frontend, API and Tests rooms, planted paths, glass walls and quiet floating panels"
              loading="lazy"
              width="1672"
              height="941"
            />
            <figcaption>
              <span>
                <Palette size={15} />
                Your visual reference
              </span>
              <span>
                Art direction reference · proposed town, not a live integration
              </span>
            </figcaption>
          </figure>
          <div className="ds-world-rules">
            <Panel>
              <div className="ds-overline">MATERIALS</div>
              <h3>Chalk. Timber. Glass. Life.</h3>
              <p>
                Chalk walls, rounded timber edges, framed glass and clusters of
                planting. Keep silhouettes readable in an orthographic overview.
              </p>
              <div className="ds-material-chips">
                {["ground", "wall", "wood", "water", "light"].map(
                  (material) => (
                    <span key={material}>
                      <i
                        style={{ background: `var(--ch-scene-${material})` }}
                      />
                      {material}
                    </span>
                  ),
                )}
              </div>
            </Panel>
            <Panel>
              <div className="ds-overline">MOTION</div>
              <h3>Respond, then settle.</h3>
              <p>
                120ms hover · 180ms panels · 320ms camera transitions. No
                bouncing counters or perpetual status pulses. Respect reduced
                motion.
              </p>
              <div className="ds-motion-track" data-gentle={gentle}>
                <span />
                <p>
                  {gentle
                    ? "Gentle motion is on"
                    : "Hover or focus to preview easing"}
                </p>
                <button aria-label="Preview movement easing">
                  <ArrowRight size={17} />
                </button>
              </div>
            </Panel>
          </div>
          <div className="ds-dark-note">
            <Moon size={23} />
            <div>
              <h3>Dark mode is a change of light.</h3>
              <p>
                Keep warm windows and timber, cool the ambient light, and soften
                highlights. Preserve character colors and usable contrast. The
                material tokens are a guide for future scene lighting; this kit
                themes the UI and the material study.
              </p>
            </div>
          </div>
        </section>
        <footer className="ds-footer">
          <span>
            <Layers2 size={17} /> CrewHub design system · v0.1
          </span>
          <span>Made for a little more togetherness.</span>
          <Button variant="ghost" onClick={downloadTokens}>
            Download CSS tokens <ArrowDownToLine size={14} />
          </Button>
        </footer>
      </main>
      <div className="ds-toast-region" role="status" aria-live="polite">
        {notice && (
          <div className="ds-toast">
            <Check size={17} />
            <span>{notice}</span>
            <IconButton
              label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </IconButton>
          </div>
        )}
      </div>
      <dialog
        ref={dialog}
        className="ds-dialog"
        aria-labelledby="room-preview-title"
        onClose={() => setDialogOpen(false)}
      >
        <div className="ds-panel-label">
          <SourceBadge source="Component preview" />
          <IconButton
            label="Close room preview"
            onClick={() => setDialogOpen(false)}
          >
            <X size={18} />
          </IconButton>
        </div>
        <Sprout size={32} />
        <h2 id="room-preview-title">A little room for something new.</h2>
        <p>
          This is the room-creation dialog pattern. Town creation will arrive
          with the town model.
        </p>
        <Notice title="Keep it intentional">
          Name the room, show its placement and capacity, then let the person
          confirm.
        </Notice>
        <Button variant="primary" onClick={() => setDialogOpen(false)}>
          Back to the field guide <ArrowRight size={15} />
        </Button>
      </dialog>
    </div>
  );
}
