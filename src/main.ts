import { mountCalculator } from "./ui/calculator";
import { mountSceneView } from "./ui/sceneView";

const views = {
  cena: document.getElementById("cena")!,
  calc: document.getElementById("calc")!,
};
type Tab = keyof typeof views;

mountSceneView(views.cena);
mountCalculator(views.calc);

function show(tab: Tab) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== tab;
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) =>
    b.classList.toggle("on", b.dataset.tab === tab),
  );
  try {
    localStorage.setItem("aba", tab);
  } catch {
    /* sem armazenamento: ignora */
  }
}

document.getElementById("tabs")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
  if (b) show(b.dataset.tab as Tab);
});

let initial: Tab = "cena";
try {
  const saved = localStorage.getItem("aba");
  if (saved === "cena" || saved === "calc") initial = saved;
} catch {
  /* ignora */
}
show(initial);
