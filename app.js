// BodyScan — PWA V2 (testes)
// - Perfis múltiplos
// - Histórico por perfil
// - Relatório PDF (via janela de impressão)
// - Qualidade de fotos por heurísticas (brilho + nitidez proxy)

const $ = (id) => document.getElementById(id);

const els = {
  // profile
  profileSelect: $("profileSelect"),
  btnAddProfile: $("btnAddProfile"),
  btnDeleteProfile: $("btnDeleteProfile"),
  profileMsg: $("profileMsg"),

  // tabs
  tabs: Array.from(document.querySelectorAll(".tab")),
  panes: {
    avaliacao: $("tab-avaliacao"),
    historico: $("tab-historico"),
    config: $("tab-config"),
  },

  // inputs
  sexo: $("sexo"),
  idade: $("idade"),
  altura: $("altura"),
  peso: $("peso"),
  toggleSalvarFotos: $("toggleSalvarFotos"),
  msgValidacao: $("msgValidacao"),

  // photos
  fotoFrente: $("fotoFrente"),
  fotoCostas: $("fotoCostas"),
  fotoPerfilE: $("fotoPerfilE"),
  fotoPerfilD: $("fotoPerfilD"),
  prevFrente: $("prevFrente"),
  prevCostas: $("prevCostas"),
  prevPerfilE: $("prevPerfilE"),
  prevPerfilD: $("prevPerfilD"),
  scoreFrente: $("scoreFrente"),
  scoreCostas: $("scoreCostas"),
  scorePerfilE: $("scorePerfilE"),
  scorePerfilD: $("scorePerfilD"),

  // actions
  btnCalcular: $("btnCalcular"),
  btnLimparFotos: $("btnLimparFotos"),
  btnSalvar: $("btnSalvar"),
  btnExportar: $("btnExportar"),
  btnRelatorio: $("btnRelatorio"),
  btnApagar: $("btnApagar"),
  btnResetTudo: $("btnResetTudo"),

  // outputs
  outImc: $("outImc"),
  outImcClass: $("outImcClass"),
  outGord: $("outGord"),
  outGordNota: $("outGordNota"),
  outImg: $("outImg"),
  outGordaKg: $("outGordaKg"),
  outMagraKg: $("outMagraKg"),
  outConf: $("outConf"),
  outConfWhy: $("outConfWhy"),

  // history
  histEmpty: $("histEmpty"),
  histList: $("histList"),

  // tutorial modal
  btnTutorial: $("btnTutorial"),
  modalTutorial: $("modalTutorial"),
  btnCloseTutorial: $("btnCloseTutorial"),

  // install
  btnInstall: $("btnInstall"),
};

const KEY_PROFILES = "bodyscan_profiles_v1";     // array of {id,name}
const KEY_ACTIVE_PROFILE = "bodyscan_active_profile_v1";
const KEY_HISTORY_PREFIX = "bodyscan_history_profile_"; // + profileId
const KEY_PHOTOS_PREFIX = "bodyscan_photos_profile_";   // + profileId

let deferredPrompt = null;
let lastResult = null;

let photoScores = { frente: null, costas: null, perfilE: null, perfilD: null };
let photoDataUrls = { frente: null, costas: null, perfilE: null, perfilD: null };

function clamp(x, min, max){ return Math.max(min, Math.min(max, x)); }
function round(x, d=1){
  const p = Math.pow(10,d);
  return Math.round(x*p)/p;
}

function showMsg(el, text){
  el.textContent = text;
  el.classList.remove("hidden");
}
function hideMsg(el){ el.classList.add("hidden"); }

function uid(){
  return "p_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

function loadProfiles(){
  try{
    const raw = localStorage.getItem(KEY_PROFILES);
    const arr = raw ? JSON.parse(raw) : [];
    if(Array.isArray(arr) && arr.length) return arr;
  } catch {}
  // default
  const def = [{ id: "p_default", name: "Meu perfil" }];
  localStorage.setItem(KEY_PROFILES, JSON.stringify(def));
  localStorage.setItem(KEY_ACTIVE_PROFILE, "p_default");
  return def;
}

function saveProfiles(arr){
  localStorage.setItem(KEY_PROFILES, JSON.stringify(arr));
}

function getActiveProfileId(){
  return localStorage.getItem(KEY_ACTIVE_PROFILE) || "p_default";
}
function setActiveProfileId(id){
  localStorage.setItem(KEY_ACTIVE_PROFILE, id);
}

function refreshProfileSelect(){
  const profiles = loadProfiles();
  const active = getActiveProfileId();

  els.profileSelect.innerHTML = "";
  for(const p of profiles){
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    if(p.id === active) opt.selected = true;
    els.profileSelect.appendChild(opt);
  }
}

function currentProfile(){
  const profiles = loadProfiles();
  const id = getActiveProfileId();
  return profiles.find(p => p.id === id) || profiles[0];
}

function historyKey(profileId){ return KEY_HISTORY_PREFIX + profileId; }
function photosKey(profileId){ return KEY_PHOTOS_PREFIX + profileId; }

function loadHistory(profileId){
  try{
    const raw = localStorage.getItem(historyKey(profileId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveHistory(profileId, list){
  localStorage.setItem(historyKey(profileId), JSON.stringify(list));
}

function parseAlturaToMeters(input){
  const raw = String(input || "").trim().replace(",", ".");
  if(!raw) return null;
  const val = Number(raw);
  if(Number.isNaN(val)) return null;

  if(val > 10) return val / 100;
  return val;
}

function imcClass(imc){
  if(imc < 18.5) return "Abaixo do peso";
  if(imc < 25) return "Peso normal";
  if(imc < 30) return "Sobrepeso";
  if(imc < 35) return "Obesidade I";
  if(imc < 40) return "Obesidade II";
  return "Obesidade III";
}

function validateInputs(){
  hideMsg(els.msgValidacao);

  const sexo = els.sexo.value;
  const idade = Number(els.idade.value);
  const peso = Number(els.peso.value);
  const altura_m = parseAlturaToMeters(els.altura.value);

  if(!(idade >= 18 && idade <= 90)) return { ok:false, reason:"Idade deve estar entre 18 e 90." };
  if(!(peso >= 30 && peso <= 250)) return { ok:false, reason:"Peso deve estar entre 30 e 250 kg." };
  if(!(altura_m && altura_m >= 1.20 && altura_m <= 2.30)) return { ok:false, reason:"Altura deve estar entre 1,20m e 2,30m (ou 120–230 cm)." };
  if(!(sexo === "M" || sexo === "F")) return { ok:false, reason:"Selecione o sexo." };

  return { ok:true, sexo, idade, peso, altura_m };
}

function calcAll({sexo, idade, peso, altura_m}){
  const imc = peso / (altura_m * altura_m);
  const sexo_num = (sexo === "M") ? 1 : 0;

  let percG = (1.20 * imc) + (0.23 * idade) - (10.8 * sexo_num) - 5.4;
  const percG_raw = percG;
  percG = clamp(percG, 3, 60);
  const truncated = Math.abs(percG - percG_raw) > 0.001;

  const massaGorda = peso * (percG / 100);
  const massaMagra = peso - massaGorda;
  const img = massaGorda / (altura_m * altura_m);

  return { sexo, idade, peso, altura_m, imc, percG, percG_raw, truncated, massaGorda, massaMagra, img };
}

async function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function scoreImage(dataUrl){
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const canvas = document.createElement("canvas");
  const w = 360;
  const h = Math.round((img.height / img.width) * w);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // brilho médio
  let sum = 0;
  for(let i=0;i<data.length;i+=4){
    const r=data[i], g=data[i+1], b=data[i+2];
    sum += (0.2126*r + 0.7152*g + 0.0722*b);
  }
  const mean = sum / (data.length/4);

  // nitidez proxy (gradiente)
  const gray = new Float32Array(w*h);
  let idx=0;
  for(let i=0;i<data.length;i+=4){
    const r=data[i], g=data[i+1], b=data[i+2];
    gray[idx++] = 0.2126*r + 0.7152*g + 0.0722*b;
  }
  let gradSum = 0, count = 0;
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const gx = gray[y*w + (x+1)] - gray[y*w + (x-1)];
      const gy = gray[(y+1)*w + x] - gray[(y-1)*w + x];
      gradSum += Math.abs(gx) + Math.abs(gy);
      count++;
    }
  }
  const sharp = gradSum / count;

  // penalidade por resolução muito baixa
  const resPenalty = (img.width < 800 || img.height < 800) ? 12 : 0;

  let score = 100 - resPenalty;
  if(mean < 60) score -= (60-mean) * 0.6;
  if(mean > 200) score -= (mean-200) * 0.6;
  if(sharp < 14) score -= (14-sharp) * 4.0;
  score = clamp(score, 0, 100);

  const notes = [];
  if(resPenalty) notes.push("Res. baixa");
  if(mean < 70) notes.push("Luz baixa");
  if(mean > 190) notes.push("Luz estourada");
  if(sharp < 14) notes.push("Possível borrado");
  if(notes.length === 0) notes.push("Boa");

  return { score: Math.round(score), mean: Math.round(mean), sharp: Math.round(sharp*10)/10, notes, w: img.width, h: img.height };
}

function setBadge(el, obj){
  el.textContent = `Qualidade: ${obj.score}/100 • ${obj.notes.join(", ")}`;
  el.classList.remove("hidden");
}

function setPreview(imgEl, dataUrl){
  imgEl.src = dataUrl;
  imgEl.classList.remove("hidden");
}

async function handlePhoto(fileInput, prevEl, badgeEl, key){
  const file = fileInput.files && fileInput.files[0];
  if(!file) return;

  const dataUrl = await fileToDataUrl(file);
  photoDataUrls[key] = dataUrl;
  setPreview(prevEl, dataUrl);

  const scored = await scoreImage(dataUrl);
  photoScores[key] = scored.score;
  setBadge(badgeEl, scored);

  maybePersistPhotos();
}

function photoSummary(){
  const scores = Object.values(photoScores).filter(v => typeof v === "number");
  const count = scores.length;
  const avg = count ? scores.reduce((a,b)=>a+b,0)/count : null;
  const min = count ? Math.min(...scores) : null;
  return { count, avg: avg ? Math.round(avg) : null, min, scores };
}

function reliabilityLabel(inputsOk, summary, truncated){
  if(!inputsOk) return { label:"—", why:"Preencha dados válidos para calcular." };

  const { count, avg, min } = summary;

  // se truncou %G por plausibilidade => baixa
  if(truncated) return { label:"Baixa", why:"Estimativa fora da faixa plausível. Confira dados e refaça fotos." };

  if(count === 0) return { label:"Média", why:"Sem fotos — cálculo apenas por fórmula (IMC/idade/sexo)." };

  if(count >= 4 && avg >= 75 && min >= 60) return { label:"Alta", why:"4 fotos com qualidade boa (consistência melhor)." };
  if(count >= 2 && avg >= 60) return { label:"Média", why:"Fotos suficientes, porém qualidade média." };
  return { label:"Baixa", why:"Poucas fotos ou qualidade baixa. Tente refazer com melhor luz/enquadramento." };
}

function renderResult(res, conf, summary){
  els.outImc.textContent = round(res.imc, 1).toFixed(1);
  els.outImcClass.textContent = imcClass(res.imc);

  els.outGord.textContent = `${round(res.percG, 1).toFixed(1)}%`;
  els.outImg.textContent = round(res.img, 1).toFixed(1);
  els.outGordaKg.textContent = `${round(res.massaGorda, 1).toFixed(1)} kg`;
  els.outMagraKg.textContent = `${round(res.massaMagra, 1).toFixed(1)} kg`;

  els.outConf.textContent = conf.label;
  els.outConfWhy.textContent = `${conf.why} (fotos: ${summary.count}, média: ${summary.avg ?? "—"}/100)`;

  if(res.truncated){
    els.outGordNota.textContent = "Aviso: valor estimado caiu fora da faixa plausível e foi ajustado.";
  } else {
    els.outGordNota.textContent = "Fórmula baseada em IMC/idade/sexo (adultos).";
  }
}

function renderHistory(){
  const profile = currentProfile();
  const list = loadHistory(profile.id);

  els.histList.innerHTML = "";
  if(list.length === 0){
    els.histEmpty.classList.remove("hidden");
    return;
  }
  els.histEmpty.classList.add("hidden");

  for(const item of list.slice().reverse()){
    const div = document.createElement("div");
    div.className = "histItem";

    const left = document.createElement("div");
    left.className = "left";
    const d = new Date(item.ts);
    left.innerHTML = `<strong>${d.toLocaleString("pt-BR")}</strong>
      <span class="muted">Peso: ${item.peso} kg • Altura: ${item.altura_cm} cm • Idade: ${item.idade} • Sexo: ${item.sexo}</span>`;

    const right = document.createElement("div");
    right.className = "right";
    right.innerHTML = `
      <span class="pill">%G ${item.percG.toFixed(1)}%</span>
      <span class="pill">IMC ${item.imc.toFixed(1)}</span>
      <span class="pill">IMG ${item.img.toFixed(1)}</span>
      <span class="pill">Conf. ${item.conf}</span>
    `;

    div.appendChild(left);
    div.appendChild(right);
    els.histList.appendChild(div);
  }
}

function exportCSV(){
  const profile = currentProfile();
  const list = loadHistory(profile.id);

  if(list.length === 0){
    alert("Sem histórico para exportar.");
    return;
  }
  const headers = ["perfil","data_hora","sexo","idade","altura_cm","peso_kg","imc","perc_gordura","massa_gorda_kg","massa_magra_kg","img","confiabilidade","fotos_count","fotos_score_medio"];
  const rows = [headers.join(",")];

  for(const it of list){
    const d = new Date(it.ts);
    const values = [
      `"${profile.name}"`,
      `"${d.toLocaleString("pt-BR")}"`,
      it.sexo,
      it.idade,
      it.altura_cm,
      it.peso,
      it.imc.toFixed(2),
      it.percG.toFixed(2),
      it.massaGorda.toFixed(2),
      it.massaMagra.toFixed(2),
      it.img.toFixed(2),
      `"${it.conf}"`,
      it.photosCount,
      it.photosAvg ?? ""
    ];
    rows.push(values.join(","));
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bodyscan_${profile.name.replaceAll(" ","_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function clearPhotos(){
  for(const k of Object.keys(photoScores)){ photoScores[k]=null; photoDataUrls[k]=null; }
  for(const inp of [els.fotoFrente, els.fotoCostas, els.fotoPerfilE, els.fotoPerfilD]) inp.value = "";
  for(const img of [els.prevFrente, els.prevCostas, els.prevPerfilE, els.prevPerfilD]){ img.src=""; img.classList.add("hidden"); }
  for(const b of [els.scoreFrente, els.scoreCostas, els.scorePerfilE, els.scorePerfilD]) b.classList.add("hidden");

  const profile = currentProfile();
  localStorage.removeItem(photosKey(profile.id));
}

function maybePersistPhotos(){
  const profile = currentProfile();
  if(!els.toggleSalvarFotos.checked){
    localStorage.removeItem(photosKey(profile.id));
    return;
  }
  try{
    localStorage.setItem(photosKey(profile.id), JSON.stringify(photoDataUrls));
  } catch(e){
    console.warn("Falha ao salvar fotos (limite).", e);
    alert("Não foi possível salvar fotos (limite). Desative 'Salvar fotos'.");
  }
}

function restorePhotosIfAny(){
  const profile = currentProfile();
  try{
    const raw = localStorage.getItem(photosKey(profile.id));
    if(!raw) return;
    const obj = JSON.parse(raw);
    if(!obj) return;
    photoDataUrls = { ...photoDataUrls, ...obj };

    const mapping = [
      ["frente", els.prevFrente, els.scoreFrente],
      ["costas", els.prevCostas, els.scoreCostas],
      ["perfilE", els.prevPerfilE, els.scorePerfilE],
      ["perfilD", els.prevPerfilD, els.scorePerfilD],
    ];

    mapping.forEach(async ([k, imgEl, badgeEl]) => {
      const url = photoDataUrls[k];
      if(url){
        setPreview(imgEl, url);
        const scored = await scoreImage(url);
        photoScores[k] = scored.score;
        setBadge(badgeEl, scored);
      }
    });
  } catch {}
}

async function onCalcular(){
  const v = validateInputs();
  if(!v.ok){
    showMsg(els.msgValidacao, v.reason);
    lastResult = null;
    return;
  }
  const res = calcAll(v);
  const summary = photoSummary();
  const conf = reliabilityLabel(true, summary, res.truncated);

  lastResult = { res, conf, summary, profile: currentProfile() };
  renderResult(res, conf, summary);

  maybePersistPhotos();
}

function onSalvar(){
  if(!lastResult || !lastResult.res){
    alert("Calcule primeiro.");
    return;
  }
  const profile = currentProfile();
  const list = loadHistory(profile.id);

  const altura_cm = Math.round(lastResult.res.altura_m * 100);

  list.push({
    ts: Date.now(),
    sexo: lastResult.res.sexo,
    idade: lastResult.res.idade,
    altura_cm,
    peso: round(lastResult.res.peso, 1),
    imc: round(lastResult.res.imc, 2),
    percG: round(lastResult.res.percG, 2),
    massaGorda: round(lastResult.res.massaGorda, 2),
    massaMagra: round(lastResult.res.massaMagra, 2),
    img: round(lastResult.res.img, 2),
    conf: lastResult.conf.label,
    photosCount: lastResult.summary.count,
    photosAvg: lastResult.summary.avg,
  });

  saveHistory(profile.id, list);
  renderHistory();
  alert("Salvo no histórico do perfil.");
}

function onApagarHistorico(){
  const profile = currentProfile();
  if(confirm(`Apagar histórico do perfil "${profile.name}" neste aparelho?`)){
    localStorage.removeItem(historyKey(profile.id));
    renderHistory();
  }
}

function buildReportHTML(result){
  const d = new Date();
  const r = result.res;
  const s = result.summary;
  const profile = result.profile;

  const altura_cm = Math.round(r.altura_m * 100);

  return `<!doctype html>
  <html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BodyScan — Relatório</title>
    <style>
      body{ font-family: Arial, Helvetica, sans-serif; margin: 28px; color:#0b1220; }
      h1{ margin:0 0 6px; }
      .muted{ color:#475569; }
      .grid{ display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
      .card{ border:1px solid #cbd5e1; border-radius: 12px; padding: 12px; }
      .k{ font-size: 12px; color:#475569; }
      .v{ font-size: 22px; font-weight: 800; margin-top: 6px; }
      .row{ display:flex; gap: 10px; flex-wrap:wrap; }
      .pill{ padding: 6px 10px; border-radius: 999px; border:1px solid #cbd5e1; background:#f1f5f9; font-weight:700; font-size: 12px; }
      hr{ border:none; border-top:1px solid #e2e8f0; margin: 18px 0; }
      .disclaimer{ border:1px solid #cbd5e1; background:#f8fafc; border-radius:12px; padding: 10px 12px; margin-top: 16px; }
      @media print { .noprint{ display:none; } }
    </style>
  </head>
  <body>
    <div class="noprint" style="text-align:right; margin-bottom: 10px;">
      <button onclick="window.print()">Salvar como PDF</button>
    </div>

    <h1>BodyScan — Relatório</h1>
    <div class="muted">Gerado em ${d.toLocaleString("pt-BR")}</div>

    <hr />

    <div class="row">
      <span class="pill">Perfil: ${escapeHTML(profile.name)}</span>
      <span class="pill">Sexo: ${r.sexo}</span>
      <span class="pill">Idade: ${r.idade}</span>
      <span class="pill">Altura: ${altura_cm} cm</span>
      <span class="pill">Peso: ${r.peso} kg</span>
    </div>

    <div class="grid">
      <div class="card">
        <div class="k">IMC</div>
        <div class="v">${r.imc.toFixed(1)}</div>
        <div class="muted">${escapeHTML(imcClass(r.imc))}</div>
      </div>

      <div class="card">
        <div class="k">% Gordura (estimativa)</div>
        <div class="v">${r.percG.toFixed(1)}%</div>
        <div class="muted">Fórmula baseada em IMC/idade/sexo (adultos).</div>
      </div>

      <div class="card">
        <div class="k">IMG</div>
        <div class="v">${r.img.toFixed(1)}</div>
        <div class="muted">Índice de Massa Gorda</div>
      </div>

      <div class="card">
        <div class="k">Massa gorda</div>
        <div class="v">${r.massaGorda.toFixed(1)} kg</div>
        <div class="muted">Massa magra: ${r.massaMagra.toFixed(1)} kg</div>
      </div>

      <div class="card">
        <div class="k">Confiabilidade</div>
        <div class="v">${escapeHTML(result.conf.label)}</div>
        <div class="muted">${escapeHTML(result.conf.why)} (fotos: ${s.count}, média: ${s.avg ?? "—"}/100)</div>
      </div>

      <div class="card">
        <div class="k">Fórmulas</div>
        <div class="muted">
          IMC = peso / altura²<br/>
          %G = 1,20×IMC + 0,23×idade − 10,8×sexo_num − 5,4<br/>
          Massa gorda = peso×(%G/100)<br/>
          IMG = massa gorda / altura²
        </div>
      </div>
    </div>

    <div class="disclaimer">
      <strong>Aviso:</strong> Este relatório é uma <em>estimativa</em> populacional e pode divergir de métodos clínicos (DEXA, bioimpedância profissional, dobras cutâneas).
    </div>
  </body>
  </html>`;
}

function escapeHTML(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function gerarRelatorio(){
  if(!lastResult || !lastResult.res){
    alert("Calcule primeiro.");
    return;
  }
  const html = buildReportHTML(lastResult);
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function registerSW(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

// Tabs
function setTab(name){
  els.tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(els.panes).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  if(name === "historico") renderHistory();
}
els.tabs.forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));

// Tutorial
els.btnTutorial.addEventListener("click", () => els.modalTutorial.classList.remove("hidden"));
els.btnCloseTutorial.addEventListener("click", () => els.modalTutorial.classList.add("hidden"));
els.modalTutorial.addEventListener("click", (e) => { if(e.target === els.modalTutorial) els.modalTutorial.classList.add("hidden"); });

// PWA install
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  els.btnInstall.classList.remove("hidden");
});
els.btnInstall.addEventListener("click", async () => {
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  els.btnInstall.classList.add("hidden");
});

// Photo inputs
els.fotoFrente.addEventListener("change", () => handlePhoto(els.fotoFrente, els.prevFrente, els.scoreFrente, "frente"));
els.fotoCostas.addEventListener("change", () => handlePhoto(els.fotoCostas, els.prevCostas, els.scoreCostas, "costas"));
els.fotoPerfilE.addEventListener("change", () => handlePhoto(els.fotoPerfilE, els.prevPerfilE, els.scorePerfilE, "perfilE"));
els.fotoPerfilD.addEventListener("change", () => handlePhoto(els.fotoPerfilD, els.prevPerfilD, els.scorePerfilD, "perfilD"));

els.btnCalcular.addEventListener("click", onCalcular);
els.btnLimparFotos.addEventListener("click", () => { clearPhotos(); alert("Fotos limpas."); });
els.btnSalvar.addEventListener("click", onSalvar);
els.btnExportar.addEventListener("click", exportCSV);
els.btnRelatorio.addEventListener("click", gerarRelatorio);
els.btnApagar.addEventListener("click", onApagarHistorico);

// Profiles
els.profileSelect.addEventListener("change", () => {
  setActiveProfileId(els.profileSelect.value);
  clearPhotos();
  restorePhotosIfAny();
  renderHistory();
});

els.btnAddProfile.addEventListener("click", () => {
  hideMsg(els.profileMsg);
  const name = prompt("Nome do novo perfil (ex.: Cliente João):");
  if(!name) return;
  const clean = name.trim();
  if(clean.length < 2){
    showMsg(els.profileMsg, "Nome muito curto.");
    return;
  }
  const profiles = loadProfiles();
  const id = uid();
  profiles.push({ id, name: clean });
  saveProfiles(profiles);
  setActiveProfileId(id);
  refreshProfileSelect();
  renderHistory();
  clearPhotos();
  alert("Perfil criado.");
});

els.btnDeleteProfile.addEventListener("click", () => {
  hideMsg(els.profileMsg);
  const p = currentProfile();
  const profiles = loadProfiles();
  if(profiles.length <= 1){
    showMsg(els.profileMsg, "Você precisa manter pelo menos 1 perfil.");
    return;
  }
  if(!confirm(`Excluir o perfil "${p.name}" e TODO o histórico dele deste aparelho?`)) return;

  // remove history + photos
  localStorage.removeItem(historyKey(p.id));
  localStorage.removeItem(photosKey(p.id));

  const remain = profiles.filter(x => x.id !== p.id);
  saveProfiles(remain);
  setActiveProfileId(remain[0].id);
  refreshProfileSelect();
  clearPhotos();
  renderHistory();
  alert("Perfil excluído.");
});

els.btnResetTudo.addEventListener("click", () => {
  if(!confirm("Apagar TUDO deste aparelho (perfis, históricos e fotos salvas)?")) return;
  // remove all related keys
  const profiles = loadProfiles();
  profiles.forEach(p => {
    localStorage.removeItem(historyKey(p.id));
    localStorage.removeItem(photosKey(p.id));
  });
  localStorage.removeItem(KEY_PROFILES);
  localStorage.removeItem(KEY_ACTIVE_PROFILE);
  // recreate default
  loadProfiles();
  refreshProfileSelect();
  clearPhotos();
  renderHistory();
  alert("Tudo apagado. Perfil padrão recriado.");
});

// init
registerSW();
refreshProfileSelect();
renderHistory();
restorePhotosIfAny();
