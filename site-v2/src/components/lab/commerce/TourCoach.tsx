import { useEffect, useRef, useState } from "react";
import { tour } from "../../../../../supabase/functions/_shared/commerce/domain";

const targets = [".cr-rule", ".cr-code", ".cr-trace", ".cr-results", ".cr-diagnosis", ".cr-code", ".cr-results", ".cr-review"];
export default function TourCoach({ index, text, live, playing, working, onPause, onPlay, onHide, onNext }: {
  index: number; text: string; live: boolean; playing: boolean; working: boolean;
  onPause: () => void; onPlay: () => void; onHide: () => void; onNext: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 100, visible: false });
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onHide(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onHide]);
  useEffect(() => {
    const target = document.querySelector<HTMLElement>(targets[index]);
    if (!target) return;
    target.dataset.tourActive = "true";
    target.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    return () => { delete target.dataset.tourActive; };
  }, [index]);
  useEffect(() => {
    const target = document.querySelector<HTMLElement>(targets[index]);
    function place() {
      if (!target || !ref.current) return;
      const r = target.getBoundingClientRect();
      const width = ref.current.offsetWidth, height = ref.current.offsetHeight;
      const gap = 16, margin = 12;
      const rightFits = r.right + gap + width <= innerWidth - margin;
      const leftFits = r.left - gap - width >= margin;
      const left = rightFits ? r.right + gap : leftFits ? r.left - gap - width : Math.min(Math.max(margin, r.left), innerWidth - width - margin);
      const preferredTop = rightFits || leftFits ? r.top : r.bottom + gap + height < innerHeight - margin ? r.bottom + gap : r.top - height - gap;
      const top = Math.max(80, Math.min(preferredTop, innerHeight - height - margin));
      setPosition({left, top, visible: true});
    }
    place();
    const observer = new ResizeObserver(place);
    if (ref.current) observer.observe(ref.current);
    if (target) observer.observe(target);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { observer.disconnect(); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [index, text, working]);
  return <aside ref={ref} className="cr-tour-tip" aria-label="Guided step tip" style={{left: position.left, top: position.top, visibility: position.visible ? "visible" : "hidden"}} onMouseEnter={onPause} onFocusCapture={onPause}>
    <div className="cr-tip-heading"><span>Step {index + 1} / {tour.length}</span><button className="cr-link" onClick={onHide} aria-label="Hide tip cards">Hide tips</button></div>
    <h3>{tour[index].title}</h3>
    <p aria-live="polite">{text}</p>
    <small>{live ? "AI guidance" : "Reference fallback"} · {working ? "Waiting for AI" : playing ? "Playing · hover to pause" : "Paused · read at your pace"}</small>
    <div className="cr-tip-actions">
      <button className="cr-button" disabled={index === tour.length - 1} onClick={playing ? onPause : onPlay}>{playing ? "Pause tour" : "Resume tour"}</button>
      <button className="cr-button cr-primary" disabled={index === tour.length - 1} onClick={onNext}>Next step</button>
    </div>
  </aside>;
}
