import { useEffect, useState } from "react";
import { callLab } from "../../lib/lab-client";
export type ModelCatalog = {
  models: { id: string; label: string; verified: boolean }[];
  defaultModel: string;
  checkedAt: string;
  unavailablePreference?: string | null;
};
export function useModelCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      const next = await callLab<ModelCatalog>("model-catalog", {
        action: "list",
      });
      setCatalog(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load models.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return { catalog, setCatalog, error, load };
}
export default function ModelPreference() {
  const { catalog, setCatalog, error, load } = useModelCatalog();
  const [selected, setSelected] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (catalog) setSelected(catalog.defaultModel);
  }, [catalog]);
  return (
    <section className="settings-section">
      <h2>Your assistant model</h2>
      <p>
        Your saved default follows your account. A model chosen in the graph
        applies only to that graph visit.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="text-link" onClick={load}>
            Reload models
          </button>
        </p>
      )}
      {catalog ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setNotice("");
            try {
              const next = await callLab<ModelCatalog>("model-catalog", {
                action: "save",
                model: selected,
              });
              setCatalog(next);
              setNotice("Your default model was saved.");
            } catch (e) {
              setNotice(
                e instanceof Error ? e.message : "Could not save model.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {catalog.unavailablePreference && (
            <p role="status">
              Your saved model is currently unavailable. Using{" "}
              {catalog.defaultModel} until you save another choice.
            </p>
          )}
          <label htmlFor="preferred-model">Default assistant model</label>
          <select
            id="preferred-model"
            value={selected}
            disabled={busy}
            onChange={(e) => setSelected(e.target.value)}
          >
            {catalog.models.map((model) => (
              <option value={model.id} key={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <p className="lab-muted">
            NVIDIA free chat endpoints · checked {catalog.checkedAt}. Provider
            limits still apply.
          </p>
          <button
            className="button button-primary"
            disabled={busy || !selected}
          >
            {busy ? "Saving…" : "Save model preference"}
          </button>
        </form>
      ) : (
        !error && <p role="status">Loading available models…</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
