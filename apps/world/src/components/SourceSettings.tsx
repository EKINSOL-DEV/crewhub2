/* Settings > Source: Automatic, Demo or Live, kept in this browser; the host URL as the page reaches it; what runs now
   and why. Changing the choice reloads the page without a `?source=` override, since the source is decided once before
   the app mounts (state/source.ts). */
import { translate, useT } from "../i18n";
import { useHostHealth } from "../state/health";
import { hostUrl, hrefWithoutOverride, PROBE_TIMEOUT_MS, SOURCE_SETTINGS, writeSourceSetting, type SourceSetting } from "../state/source";
import { pageConfig } from "../state/page";
import { Field } from "./primitives";

export function SourceSettings() {
  const { t } = useT();
  const source = pageConfig().source;
  // The host's health as last read, not the one the page started with: a key pasted while Live is another bot's (round 48).
  const health = useHostHealth();
  const choose = (value: SourceSetting) => {
    writeSourceSetting(value);
    globalThis.location.assign(hrefWithoutOverride(globalThis.location));
  };
  const reason =
    source.reason === "url"
      ? t("world.source.reason.url", { source: source.override ?? "" })
      : source.reason === "probe-silent"
        ? t("world.source.reason.probe-silent", { ms: PROBE_TIMEOUT_MS })
        : t(`world.source.reason.${source.reason}`);
  return (
    <fieldset className="source-settings">
      <legend className="label">{t("world.source.setting")}</legend>
      <Field
        control="select"
        size="sm"
        label={t("world.source.setting")}
        hideLabel
        className="source-setting"
        hint={source.setting === "auto" ? t("world.source.hint.auto", { ms: PROBE_TIMEOUT_MS }) : t("world.source.hint.fixed")}
        value={source.setting}
        onChange={(e) => choose(e.currentTarget.value as SourceSetting)}
      >
        {SOURCE_SETTINGS.map((value) => (
          <option key={value} value={value}>
            {translate(`world.source.${value}`)}
          </option>
        ))}
      </Field>
      <p className="hint source-now">
        {t(`world.source.now.${source.source}`)} {reason}
      </p>
      <p className="hint source-host">
        {t("world.source.hostUrl", { url: hostUrl(globalThis.location?.origin ?? "") })}
        {health && ` ${t(source.source === "live" && health.keyName ? "world.source.observer" : "world.source.keyName", { name: health.keyName })}`}
        {health?.sharedKey && ` ${t("world.source.sharedKey")}`}
      </p>
    </fieldset>
  );
}
