/* Settings > Source: Automatic, Demo or Live, kept in this browser; the host URL as the page reaches it; what runs now
   and why. Changing the choice reloads the page without a `?source=` override, since the source is decided once before
   the app mounts (state/source.ts). */
import { translate, useT } from "../i18n";
import { hostUrl, hrefWithoutOverride, PROBE_TIMEOUT_MS, SOURCE_SETTINGS, writeSourceSetting, type SourceSetting } from "../state/source";
import { SOURCE } from "../state/world";
import { Field } from "./primitives";

export function SourceSettings() {
  const { t } = useT();
  const choose = (value: SourceSetting) => {
    writeSourceSetting(value);
    globalThis.location.assign(hrefWithoutOverride(globalThis.location));
  };
  const reason =
    SOURCE.reason === "url"
      ? t("world.source.reason.url", { source: SOURCE.override ?? "" })
      : SOURCE.reason === "probe-silent"
        ? t("world.source.reason.probe-silent", { ms: PROBE_TIMEOUT_MS })
        : t(`world.source.reason.${SOURCE.reason}`);
  return (
    <fieldset className="source-settings">
      <legend className="label">{t("world.source.setting")}</legend>
      <Field
        control="select"
        size="sm"
        label={t("world.source.setting")}
        hideLabel
        className="source-setting"
        hint={SOURCE.setting === "auto" ? t("world.source.hint.auto", { ms: PROBE_TIMEOUT_MS }) : t("world.source.hint.fixed")}
        value={SOURCE.setting}
        onChange={(e) => choose(e.currentTarget.value as SourceSetting)}
      >
        {SOURCE_SETTINGS.map((value) => (
          <option key={value} value={value}>
            {translate(`world.source.${value}`)}
          </option>
        ))}
      </Field>
      <p className="hint source-now">
        {t(`world.source.now.${SOURCE.source}`)} {reason}
      </p>
      <p className="hint source-host">
        {t("world.source.hostUrl", { url: hostUrl(globalThis.location?.origin ?? "") })}
        {SOURCE.health && ` ${t("world.source.keyName", { name: SOURCE.health.keyName })}`}
        {SOURCE.health?.sharedKey && ` ${t("world.source.sharedKey")}`}
      </p>
    </fieldset>
  );
}
