import { fieldGroups, formatField, photoSlots, sample, type FieldId } from "./fields";

const form = document.querySelector<HTMLFormElement>("#maisoku-form")!;
const paper = document.querySelector<HTMLElement>("#maisoku-paper")!;
const stage = document.querySelector<HTMLElement>("#maisoku-stage")!;
const holder = document.querySelector<HTMLElement>("#maisoku-holder")!;
const printButton = document.querySelector<HTMLButtonElement>("#maisoku-print")!;
const status = document.querySelector<HTMLElement>("#maisoku-status")!;
const imageUrls = new Map<string, string>();
const imageVersions = new Map<string, number>();
let loadingImages = 0;

function input(id: FieldId) {
  return form.elements.namedItem(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function render() {
  for (const target of paper.querySelectorAll<HTMLElement>("[data-field]")) {
    const id = target.dataset.field as FieldId;
    const value = formatField(id, input(id).value);
    target.textContent = value || target.dataset.empty || "";
    target.classList.toggle("is-placeholder", !value);
  }
  const name = input("propertyName").value.trim();
  document.title = `${name ? `${name}｜` : ""}マイソク作成｜かなえるTools`;
}

function fitPreview() {
  const fullSize = document.querySelector<HTMLInputElement>("#maisoku-fullsize")!.checked;
  const available = Math.max(1, stage.clientWidth - 32);
  const scale = fullSize ? 1 : Math.min(1, available / paper.offsetWidth);
  paper.style.setProperty("--paper-scale", String(scale));
  holder.style.width = `${paper.offsetWidth * scale}px`;
  holder.style.height = `${paper.offsetHeight * scale}px`;
}

function clearImage(id: string) {
  imageVersions.set(id, (imageVersions.get(id) || 0) + 1);
  const image = paper.querySelector<HTMLImageElement>(`[data-photo="${id}"]`)!;
  image.removeAttribute("src");
  image.hidden = true;
  image.parentElement!.classList.remove("has-photo");
  const old = imageUrls.get(id);
  if (old) URL.revokeObjectURL(old);
  imageUrls.delete(id);
  document.querySelector<HTMLInputElement>(`#photo-${id}`)!.value = "";
  document.querySelector<HTMLButtonElement>(`[data-clear-photo="${id}"]`)!.disabled = true;
  document.querySelector<HTMLElement>(`#photo-error-${id}`)!.textContent = "";
}

for (const slot of photoSlots) {
  const fileInput = document.querySelector<HTMLInputElement>(`#photo-${slot.id}`)!;
  const error = document.querySelector<HTMLElement>(`#photo-error-${slot.id}`)!;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    error.textContent = "";
    const version = (imageVersions.get(slot.id) || 0) + 1;
    imageVersions.set(slot.id, version);
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !["", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      error.textContent = "JPEG・PNG・WebPの画像を選んでください。";
      fileInput.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    let retained = false;
    loadingImages++;
    printButton.disabled = true;
    status.textContent = "写真を読み込んでいます…";
    try {
      const decoded = new Image();
      decoded.src = url;
      await decoded.decode();
      if (imageVersions.get(slot.id) !== version) return;
      const image = paper.querySelector<HTMLImageElement>(`[data-photo="${slot.id}"]`)!;
      image.src = url;
      image.hidden = false;
      image.parentElement!.classList.add("has-photo");
      const old = imageUrls.get(slot.id);
      if (old) URL.revokeObjectURL(old);
      imageUrls.set(slot.id, url);
      retained = true;
      document.querySelector<HTMLButtonElement>(`[data-clear-photo="${slot.id}"]`)!.disabled = false;
    } catch {
      if (imageVersions.get(slot.id) === version) {
        error.textContent = "画像を読み込めませんでした。別の画像を選んでください。";
        fileInput.value = "";
      }
    } finally {
      if (!retained) URL.revokeObjectURL(url);
      loadingImages--;
      printButton.disabled = loadingImages > 0;
      status.textContent = loadingImages ? "写真を読み込んでいます…" : "";
    }
  });
  document.querySelector<HTMLButtonElement>(`[data-clear-photo="${slot.id}"]`)!.addEventListener("click", () => clearImage(slot.id));
}

form.addEventListener("input", render);
form.addEventListener("change", render);
document.querySelector("#maisoku-fullsize")!.addEventListener("change", fitPreview);
new ResizeObserver(fitPreview).observe(stage);

document.querySelector("#maisoku-sample")!.addEventListener("click", () => {
  const fields = fieldGroups.flatMap(group => group.fields);
  if (fields.some(field => input(field.id).value) && !window.confirm("入力内容を架空のサンプルに置き換えます。写真はそのまま残ります。よろしいですか？")) return;
  for (const field of fields) input(field.id).value = sample[field.id] || "";
  render();
});

document.querySelector("#maisoku-reset")!.addEventListener("click", () => {
  if (!window.confirm("入力した内容と写真をすべてクリアしますか？")) return;
  form.reset();
  for (const slot of photoSlots) clearImage(slot.id);
  render();
});

printButton.addEventListener("click", async () => {
  printButton.disabled = true;
  try {
    await document.fonts.ready;
    await Promise.all([...paper.querySelectorAll<HTMLImageElement>("img[src]")].map(image => image.decode()));
    window.print();
  } catch {
    status.textContent = "写真の読み込みを確認してから、もう一度お試しください。";
  } finally {
    printButton.disabled = loadingImages > 0;
  }
});

// ブラウザの戻る操作で復元された入力内容も、図面へ反映する。
window.addEventListener("pageshow", render);
render();
fitPreview();
