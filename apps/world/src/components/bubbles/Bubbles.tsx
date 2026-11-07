// Source: crewhub-loops apps/web/src/components/bubbles/Bubbles.tsx @ a1bed0f. Copied verbatim; do not edit here, change the source and re-copy.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import type { AgentOut } from "../../api/types";
import { useT } from "../../i18n";
import { useSession } from "../../state/session";
import { timeAgo } from "../board/format";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { Button, Card, Chip, Field, Menu } from "../primitives";
import { useBubblesData, useBubblesFeature, useChat, usePins } from "./queries";
import { useMessageViewport } from "./useMessageViewport";
import "./bubbles.css";

export function Bubbles({ narrow }: { narrow: boolean }) {
  const { isAdmin } = useSession();
  const feature = useBubblesFeature(isAdmin);
  return isAdmin && feature.data === true ? <EnabledBubbles narrow={narrow} /> : null;
}

function EnabledBubbles({ narrow }: { narrow: boolean }) {
  const { t } = useT();
  const { pins, threads, agents } = useBubblesData();
  const save = usePins();
  const [active, setActive] = useState<string | null>(null);
  const dock = useRef<HTMLElement>(null);
  const [dockHeight, setDockHeight] = useState(96);
  const opener = useRef<HTMLElement | null>(null);
  const ids = pins.data?.pinnedAgentIds ?? [];
  const available = agents.data?.agents.filter((a) => !a.disabled && a.role === "lead") ?? [];
  const pinned = available.filter((a) => ids.includes(a.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const agent = available.find((a) => a.id === active);
  const unread = (id: string) => threads.data?.threads.find((th) => th.agentId === id)?.unreadCount ?? 0;
  const total = pinned.reduce((n, a) => n + unread(a.id), 0);
  const open = (id: string) => { const focused = document.activeElement as HTMLElement; opener.current = focused.closest(".menu-wrap")?.querySelector("button") ?? focused; setActive(id); };
  const close = () => { setActive(null); opener.current?.focus(); };
  const pin = (id: string) => save.mutate({ agentId: id, pinned: true });
  const pinItems = available.filter((a) => !ids.includes(a.id)).map((a) => ({ label: t("agents.bubbles.pinAgent", { name: a.displayName }), onSelect: () => pin(a.id) }));
  const featureOff = [pins.error, threads.error, save.error].some((e) => e instanceof ApiError && e.code === "feature_off");
  useLayoutEffect(() => {
    const node = dock.current;
    if (!node || narrow) return;
    const measure = () => setDockHeight(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [narrow, pins.data, agents.data, featureOff]);
  if (featureOff || !pins.data || !agents.data) return null;
  return <>
    {narrow ? <Menu name={t("agents.bubbles.chats")} trigger={{ label: t("agents.bubbles.chats"), icon: <Icon name="inbox" />, ariaLabel: t("agents.bubbles.total", { count: total }), variant: "ghost" }} items={[
      ...pinned.map((a) => ({ label: t("agents.bubbles.open", { name: a.displayName, count: unread(a.id) }), onSelect: () => open(a.id) })),
      { group: t("agents.bubbles.pin") }, ...pinItems,
    ]} /> : createPortal(<aside ref={dock} className="dock" aria-label={t("agents.bubbles.chats")}>
      {pinned.map((a) => <div className="dock-bubble" key={a.id}>
        <Button variant="avatar" pressed={active === a.id} aria-label={t("agents.bubbles.open", { name: a.displayName, count: unread(a.id) })} onClick={() => active === a.id ? close() : open(a.id)}>
          <Avatar kind="agent" name={a.displayName} size="lg" />
        </Button>
        <span className="dock-dot" data-presence={a.lastSeenAt ? "idle" : "offline"} aria-hidden="true" />
        {unread(a.id) > 0 && <span className="badge badge-accent dock-badge" aria-hidden="true">{unread(a.id)}</span>}
      </div>)}
      <Menu name={t("agents.bubbles.pin")} trigger={{ label: "…", ariaLabel: t("agents.bubbles.pin"), variant: "ghost" }} items={pinItems} />
    </aside>, document.body)}
    {save.isError && <span role="alert">{t("agents.bubbles.pinError")}</span>}
    {agent && createPortal(<Chat key={`${agent.id}-${narrow}`} agent={agent} narrow={narrow} dockHeight={dockHeight} pinned={ids.includes(agent.id)} onClose={close} onPin={() => save.mutate({ agentId: agent.id, pinned: !ids.includes(agent.id) })} />, document.body)}
  </>;
}

function Chat({ agent, narrow, dockHeight, pinned, onClose, onPin }: { agent: AgentOut; narrow: boolean; dockHeight: number; pinned: boolean; onClose: () => void; onPin: () => void }) {
  const { t, lang } = useT();
  const { principal } = useSession();
  const navigate = useNavigate();
  const { messages, summary, draft, updateDraft, submit, read } = useChat(agent.id, principal!.id);
  const card = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => { dialog.current?.close(); onClose(); };
  useEffect(() => {
    const sheet = dialog.current;
    const viewport = window.visualViewport;
    if (narrow && sheet && viewport) {
      const fit = () => {
        sheet.style.setProperty("--bubble-viewport-height", `${viewport.height}px`);
        sheet.style.setProperty("--bubble-viewport-top", `${viewport.offsetTop}px`);
      };
      fit();
      viewport.addEventListener("resize", fit);
      viewport.addEventListener("scroll", fit);
      return () => { viewport.removeEventListener("resize", fit); viewport.removeEventListener("scroll", fit); };
    }
  }, [narrow]);
  useEffect(() => {
    const sheet = dialog.current;
    if (narrow) sheet?.showModal();
    card.current?.focus();
    return () => sheet?.close();
  }, [narrow]);
  const all = useMemo(() => [...(messages.data?.pages ?? [])].reverse().flatMap((p) => p.messages), [messages.data?.pages]);
  const { bodyRef, readingHistory } = useMessageViewport(all, read.mutate, draft.text);
  const deliveryLabels = { queued: t("agents.bubbles.queued"), delivered: t("agents.bubbles.delivered"), answered: t("agents.bubbles.answered") };
  // These are the agent's activity tickets, not links inferred from the conversation.
  const activityTickets = new Map((summary.data?.tickets ?? []).map((ticket) => [ticket.key, { key: ticket.key, url: ticket.url, title: ticket.title }]));
  for (const comment of summary.data?.comments ?? []) {
    if (!activityTickets.has(comment.ticketKey)) activityTickets.set(comment.ticketKey, { key: comment.ticketKey, url: comment.url, title: comment.text });
  }
  const contents = <Card className="card-chat bubble-chat" style={{ "--bubble-dock-height": `${dockHeight}px` } as CSSProperties} role={narrow ? undefined : "dialog"} aria-modal={narrow ? undefined : false} aria-labelledby="bubble-chat-title" tabIndex={-1} ref={card} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
    <Card.Header title={<Chip.Person person={{ kind: "agent", displayName: agent.displayName }} />} titleId="bubble-chat-title" action={<div className="bubble-chat-actions">
      <Menu name={t("agents.bubbles.options")} trigger={{ label: "…", ariaLabel: t("agents.bubbles.options"), variant: "ghost" }} items={[
        { label: t(pinned ? "agents.bubbles.unpin" : "agents.bubbles.pin"), onSelect: onPin },
        { label: t("agents.bubbles.settings"), onSelect: () => { close(); void navigate("/settings/agents"); } },
      ]} />
      <Button variant="ghost" iconOnly aria-label={t("agents.bubbles.close")} icon={<Icon name="x" />} onClick={close} />
    </div>} />
    <div className="chat-summary" aria-label={t("agents.bubbles.summary")}>
      <span className="bubble-summary-label">{t("agents.bubbles.summary")}</span>
      {[...activityTickets.values()].map((ticket) => <Chip.Link key={ticket.key} type="ticket" href={ticket.url} linkKey={ticket.key} title={ticket.title} hint={summary.data?.comments.filter((c) => c.ticketKey === ticket.key).map((c) => c.text).join("\n")} />)}
      {summary.isError && t("agents.bubbles.summaryError")}
    </div>
    <Card.Body ref={bodyRef}>
      {messages.hasNextPage && <Button size="sm" disabled={messages.isFetchingNextPage} onClick={() => { readingHistory(); void messages.fetchNextPage(); }}>{t("agents.bubbles.older")}</Button>}
      {messages.isPending && <p role="status">{t("common.loading")}</p>}
      {messages.isError && <p role="alert">{t("agents.bubbles.loadError")} <Button size="sm" onClick={() => void messages.refetch()}>{t("agents.bubbles.retry")}</Button></p>}
      <ol className="thread" aria-label={t("agents.bubbles.messages")}>
        {all.map((m) => <li className="comment" key={m.id} data-actor={m.author.kind}>
          <Avatar kind={m.author.kind} name={m.author.displayName} />
          <div className="comment-body"><div className="comment-meta"><strong>{m.author.displayName}</strong> <time dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString(lang)}>{timeAgo(t, m.createdAt)}</time></div>
            <p className="bubble-message-text">{m.bodyText}</p>
            {m.author.kind === "user" && (m.deliveryState && ["uncertain", "unroutable", "obsolete"].includes(m.deliveryState) && !m.answeredAt
              ? <Chip.Delivery delivery={{ state: m.deliveryState, ticketId: null }} />
              : <Chip className="chip-delivery" data-state={m.state === "answered" ? "answered" : m.state === "delivered" ? "forwarded" : "pending"} icon={<Icon name={m.state === "queued" ? "clock" : "check"} size="sm" />}>{deliveryLabels[m.state]}</Chip>)}
            <span className="bubble-read-marker" data-read-message={m.id} aria-hidden="true" />
          </div>
        </li>)}
      </ol>
    </Card.Body>
    <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <Field control="textarea" autoGrow rows={1} label={t("agents.bubbles.message")} hideLabel placeholder={t("agents.bubbles.message")} value={draft.text} disabled={draft.pending} onChange={(e) => updateDraft({ text: e.target.value })} error={draft.error ? t("agents.bubbles.sendError") : undefined} />
      <Button variant="accent" type="submit" disabled={!draft.text.trim() || draft.pending}>{t("agents.bubbles.send")}</Button>
    </form>
  </Card>;
  return narrow ? <dialog className="card-dialog bubble-dialog" aria-modal="true" ref={dialog} aria-labelledby="bubble-chat-title" onCancel={(e) => { e.preventDefault(); close(); }}>{contents}</dialog> : contents;
}
