import { useEffect, useState } from "react";
import { api, ApiRequestError } from "../api";
import { ErrorMessage, Icon } from "./ui";

export interface ClientOption {
  client_id: string;
  name: string;
  client_type: string;
}
export interface InvestigatorClients {
  clients: ClientOption[];
  client_ids: string[];
  available: boolean | null;
}

/** Loads the clients and the investigator's current choice (none chosen = every client). */
export function useInvestigatorClients(userId: string) {
  const [data, setData] = useState<InvestigatorClients | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<InvestigatorClients>(`/investigators/${userId}/clients`)
      .then((result) => active && setData(result))
      .catch(() => active && setError("تعذّر تحميل قائمة البنوك والشركات."));
    return () => {
      active = false;
    };
  }, [userId]);
  return { data, setData, error };
}

/** Bank and company chips; none selected means the investigator works for every client. */
export function ClientsPicker({
  clients,
  value,
  onChange,
  disabled = false,
}: {
  clients: ClientOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const groups = [
    { title: "البنوك", items: clients.filter((client) => client.client_type === "bank") },
    { title: "الشركات", items: clients.filter((client) => client.client_type !== "bank") },
  ].filter((group) => group.items.length);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <div className="clients-picker">
      {groups.map((group) => (
        <div key={group.title} className="clients-group">
          <div className="clients-group-head">
            <b>{group.title}</b>
            <button
              type="button"
              className="link-button"
              disabled={disabled}
              onClick={() => {
                const ids = group.items.map((item) => item.client_id);
                const all = ids.every((id) => value.includes(id));
                onChange(all ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])]);
              }}
            >
              {group.items.every((item) => value.includes(item.client_id)) ? "إلغاء الكل" : "اختيار الكل"}
            </button>
          </div>
          <div className="client-chips">
            {group.items.map((client) => {
              const on = value.includes(client.client_id);
              return (
                <button
                  type="button"
                  key={client.client_id}
                  className={`client-chip${on ? " on" : ""}`}
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => toggle(client.client_id)}
                >
                  {on && <Icon name="check" size={13} />}
                  {client.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="hint clients-summary">
        {value.length
          ? `يصله فقط استعلامات ${value.length} ${value.length === 1 ? "جهة" : "جهات"} مختارة.`
          : "لم تُختر جهة: يصله استعلامات كل البنوك والشركات."}
      </p>
    </div>
  );
}

/** Head office edits which companies and banks an investigator works for. */
export function InvestigatorClientsPanel({ userId }: { userId: string }) {
  const { data, setData, error: loadError } = useInvestigatorClients(userId);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const value = chosen ?? data?.client_ids ?? [];
  const changed = chosen !== null && [...chosen].sort().join() !== [...(data?.client_ids ?? [])].sort().join();

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await api<{ client_ids: string[] }>(`/investigators/${userId}/clients`, {
        method: "PATCH",
        body: JSON.stringify({ client_ids: value }),
      });
      setData((current) => (current ? { ...current, client_ids: result.client_ids } : current));
      setChosen(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "تعذّر حفظ الجهات.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass panel">
      <div className="panel-heading">
        <h2>البنوك والشركات التي يعمل لها</h2>
        {data && data.available !== null && (
          <span className={`badge ${data.available ? "ok-badge" : "off-badge"}`}>
            {data.available ? "متاح لاستقبال الاستعلامات" : "غير متاح الآن"}
          </span>
        )}
      </div>
      <ErrorMessage message={loadError || error} />
      {data ? (
        <>
          <ClientsPicker clients={data.clients} value={value} onChange={(next) => (setSaved(false), setChosen(next))} disabled={busy} />
          <div className="inline">
            <button className="btn btn-primary" disabled={busy || !changed} onClick={() => void save()}>
              <Icon name="check" size={16} />
              {busy ? "جارٍ الحفظ…" : "حفظ الجهات"}
            </button>
            {saved && <span className="hint">حُفظت. تصله الاستعلامات الجديدة حسب اختيارك.</span>}
          </div>
        </>
      ) : (
        !loadError && <span className="image-skeleton" />
      )}
    </section>
  );
}
