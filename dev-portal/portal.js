(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const state = {
  plan: "Basic",
  usage: { hourly: 2, daily: 8, weekly: 31, proCycle: 18, totalCycle: 25, extra: 7, balance: 0.70, graceEnd: "2026-12-28", suspended: false },
  limits: { hourly: 5, daily: 20, weekly: 50, included: 20, max: 200, price: 0.10, warning: 80 },
  branches: [
    {name:"dev1",purpose:"Feature development",sha:"a91b2c3",message:"Refine account dashboard interactions",last:"Today, 4:18 PM",status:"Ready",assignees:["@leo","@maya"],url:"dev1.bsms-web.com"},
    {name:"dev2",purpose:"Experimental interface work",sha:"b72d91e",message:"Improve experimental interface components",last:"Yesterday, 8:42 PM",status:"Ready",assignees:["@leo","@aiden"],url:"dev2.bsms-web.com"},
    {name:"dev8",purpose:"Developer Portal development",sha:"c84a8bc",message:"Build interactive Dev Portal experience",last:"Yesterday, 3:05 PM",status:"Ready",assignees:["@leo"],url:"dev8.bsms-web.com"}
  ],
  deployments: [
    {status:"ready",branch:"dev1",sha:"8f31c2a",message:"Add account dashboard refinements",env:"Preview",created:"Today, 4:18 PM",duration:"42s",author:"Leo Placencia",id:1},
    {status:"ready",branch:"dev2",sha:"3bd921e",message:"Update experimental UI components",env:"Preview",created:"Yesterday, 8:42 PM",duration:"38s",author:"Maya Rivera",id:2},
    {status:"ready",branch:"dev8",sha:"f04a8bc",message:"Rebuild Dev Portal experience",env:"Preview",created:"Yesterday, 3:05 PM",duration:"51s",author:"Leo Placencia",id:3},
    {status:"error",branch:"dev1",sha:"a42bc19",message:"Adjust navigation spacing",env:"Preview",created:"Nov 19, 2:11 PM",duration:"Failed",author:"Leo Placencia",id:4},
    {status:"ready",branch:"dev2",sha:"c91e3d0",message:"Polish game cards",env:"Preview",created:"Nov 18, 6:24 PM",duration:"36s",author:"Aiden Patel",id:5},
    {status:"ready",branch:"dev8",sha:"e2b6f11",message:"Initial portal layout",env:"Preview",created:"Nov 18, 4:07 PM",duration:"48s",author:"Leo Placencia",id:6},
    {status:"ready",branch:"dev1",sha:"9c20da1",message:"Fix account panel overflow",env:"Preview",created:"Nov 17, 1:52 PM",duration:"44s",author:"Maya Rivera",id:7},
    {status:"ready",branch:"dev2",sha:"7a13cc8",message:"Add responsive game grid",env:"Preview",created:"Nov 16, 11:19 AM",duration:"39s",author:"Aiden Patel",id:8}
  ],
  people: [
    {initials:"LP",name:"Leo Placencia",handle:"@leo",role:"Developer",plan:"Basic",branches:["dev1","dev2","dev8"],total:128,success:124,prs:18,enabled:true,balance:0},
    {initials:"MR",name:"Maya Rivera",handle:"@maya",role:"Developer",plan:"Pro",branches:["dev1","dev2"],total:94,success:91,prs:14,enabled:true,balance:1.20},
    {initials:"AP",name:"Aiden Patel",handle:"@aiden",role:"Developer",plan:"Basic",branches:["dev2","dev8"],total:67,success:64,prs:9,enabled:true,balance:0},
    {initials:"JW",name:"Jordan Wells",handle:"@jordan",role:"Developer",plan:"Basic",branches:["dev1"],total:22,success:21,prs:3,enabled:true,balance:0},
    {initials:"SK",name:"Sam Kim",handle:"@sam",role:"Developer",plan:"Pro",branches:["dev1","dev2","dev8","dev4"],total:156,success:151,prs:26,enabled:true,balance:0},
    {initials:"TC",name:"Taylor Chen",handle:"@taylor",role:"Developer",plan:"Basic",branches:["dev4"],total:18,success:17,prs:2,enabled:false,balance:0}
  ],
  settings: {deploymentNotifications:true,reducedMotion:false,compactTables:false,success:true,failure:true,branch:true,billing:true,loginAlerts:true},
  notices: [{title:"Deployment ready",detail:"dev1 · Today at 4:18 PM",read:false},{title:"Branch access updated",detail:"dev8 assigned · Yesterday",read:true}],
  audit: [
    {title:"Branch dev8 assigned to Leo Placencia",detail:"Today · Administrator"},
    {title:"Deployment created",detail:"Today · Leo Placencia"},
    {title:"Pro plan recorded for Maya Rivera",detail:"Yesterday · Administrator"},
    {title:"Developer account invited",detail:"Nov 18 · Administrator"}
  ],
  adminTab:"dashboard", deploymentFilter:"all", branchFilter:"all", planView:"basic",
  modalTimer:null, activeDeployment:null, profileHandle:"@leo"
};
let demoTimer = null, demoStartedAt = 0, demoStage = 0, demoLogIndex = 0;
const $modal = $("#modalBackdrop");
const icon = name => '<iconify-icon icon="octicon:' + name + '-16"></iconify-icon>';
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => "$" + Number(n || 0).toFixed(2);
function toast(title, detail = "Preview only. No live service was changed.") {
  const region = $("#toastRegion"); if (!region) return;
  const node = document.createElement("div"); node.className = "toast";
  node.innerHTML = "<b>" + esc(title) + "</b><small>" + esc(detail) + "</small>";
  region.append(node); window.setTimeout(() => node.remove(), 3600);
}
function closeModal() {
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  if (state.modalTimer) { clearTimeout(state.modalTimer); state.modalTimer = null; }
  if (!$modal) return;
  $modal.classList.remove("open"); $modal.setAttribute("aria-hidden","true");
  document.body.style.overflow = "";
  const sc = $("#modalScroll"); if (sc) sc.onscroll = null;
}
function modal(title, description, body, primary = "Close", action = closeModal, options = {}) {
  closeModal();
  $("#modalTitle").textContent = title;
  $("#modalDescription").textContent = description;
  $("#modalBody").innerHTML = body;
  $("#modalIcon").innerHTML = icon(options.icon || "info");
  const actions = $(".modal-actions");
  actions.innerHTML = '<button class="button secondary" data-close>Cancel</button><button class="button primary" id="modalPrimary">' + esc(primary) + '</button>';
  $("#modalPrimary").onclick = action;
  $(".modal-x").style.display = options.hideX ? "none" : "";
  $modal.classList.add("open"); $modal.setAttribute("aria-hidden","false");
  document.body.style.overflow = "hidden";
  const sc = $("#modalScroll"), hint = $("#scrollHint");
  if (sc && hint) {
    const update = () => hint.classList.toggle("visible", sc.scrollHeight > sc.clientHeight + 24 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 16);
    sc.scrollTop = 0; sc.onscroll = update; requestAnimationFrame(update);
  }
}
function go(page) {
  if (!$("#page-" + page)) return;
  $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const names = {overview:"Overview",branches:"Branches",deployments:"Deployments",analytics:"Analytics",billing:"Billing & usage",directory:"Developer directory",settings:"Settings",admin:"Admin console",profile:"Developer profile"};
  $("#crumb").textContent = names[page] || page;
  window.scrollTo({top:0,behavior:state.settings.reducedMotion ? "auto" : "smooth"});
  if (page === "branches") renderBranches();
  if (page === "deployments") renderDeployments();
  if (page === "directory") renderPeople();
  if (page === "admin") renderAdmin();
}
function currentPerson() { return state.people.find(p => p.handle === state.profileHandle) || state.people[0]; }
function updateUsage() {
  const values = [["hourly",state.limits.hourly],["daily",state.limits.daily],["weekly",state.limits.weekly]];
  values.forEach(([key,max]) => {
    const used = state.usage[key], pct = Math.min(100, used / max * 100);
    const target = $("#usage-" + key);
    if (target) { target.textContent = used + " / " + max; const bar = target.closest(".limit-row")?.querySelector(".progress i"); if (bar) bar.style.width = pct + "%"; }
  });
  const week = $("#page-overview .metric-card:nth-child(2) strong");
  if (week) week.innerHTML = state.usage.weekly + '<span class="metric-unit">/ ' + state.limits.weekly + '</span>';
  const billing = $(".billing-stat strong");
  if (billing) billing.innerHTML = state.usage.weekly + ' <small>/ ' + state.limits.weekly + '</small>';
}
function renderBranches(query = $("#branchSearch")?.value || "") {
  const el = $("#branchList"); if (!el) return;
  const list = state.branches.filter(b => (b.name + " " + b.purpose).toLowerCase().includes(query.toLowerCase()) && (state.branchFilter === "all" || b.status.toLowerCase() === state.branchFilter));
  el.innerHTML = list.map(b => '<article class="branch-row"><span class="branch-glyph">' + icon("git-branch") + '</span><div class="branch-row-main"><b>' + esc(b.name) + '</b><p>' + esc(b.purpose) + '</p></div><div class="branch-row-meta"><span>COMMIT <code>' + esc(b.sha) + '</code></span><span>LAST DEPLOY <span>' + esc(b.last) + '</span></span></div><span class="status-pill ready">● ' + esc(b.status) + '</span><button class="button primary" data-deploy="' + esc(b.name) + '">Deploy ↗</button><button class="square-button" data-branch-details="' + esc(b.name) + '" aria-label="Branch details">' + icon("kebab-horizontal") + '</button></article>').join("") || '<div class="empty-state">No branches match this filter.</div>';
}
function renderDeployments() {
  const q = ($("#deploymentSearch")?.value || "").toLowerCase();
  const rows = state.deployments.filter(d => (state.deploymentFilter === "all" || d.status === state.deploymentFilter) && Object.values(d).join(" ").toLowerCase().includes(q));
  $("#deploymentRows").innerHTML = rows.map(d => '<tr><td><span class="table-status ' + (d.status === "error" ? "error" : "") + '">● ' + (d.status === "ready" ? "READY" : "FAILED") + '</span></td><td><span class="table-branch">' + icon("git-branch") + '<b>' + esc(d.branch) + '</b></span></td><td><code>' + esc(d.sha) + '</code><div class="table-muted">' + esc(d.message) + '</div></td><td>' + esc(d.env) + '</td><td>' + esc(d.created) + '</td><td>' + esc(d.duration) + '</td><td><button class="row-action" data-deployment-detail="' + d.id + '">Details →</button></td></tr>').join("") || '<tr><td colspan="7">No deployments match this filter.</td></tr>';
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.filter === state.deploymentFilter));
}
function deploymentDetail(id) {
  const d = state.deployments.find(x => x.id === Number(id)); if (!d) return;
  modal("Deployment details", d.message, '<div class="modal-data"><div><span>Status</span><b>' + d.status.toUpperCase() + '</b></div><div><span>Branch</span><b>' + esc(d.branch) + '</b></div><div><span>Commit</span><b>' + esc(d.sha) + '</b></div><div><span>Environment</span><b>' + esc(d.env) + '</b></div><div><span>Created</span><b>' + esc(d.created) + '</b></div><div><span>Duration</span><b>' + esc(d.duration) + '</b></div><div><span>Triggered by</span><b>' + esc(d.author) + '</b></div></div><div class="modal-callout neutral-callout">Sample deployment record. Production logs and status would be retrieved from Vercel.</div>', "Close details", closeModal, {icon:"file"});
}
function renderPeople(query = $("#developerSearch")?.value || "") {
  const el = $("#developerGrid"); if (!el) return;
  const plan = $(".directory-plan-filter")?.value || "all";
  const visible = state.people.filter(p => (p.name + " " + p.handle).toLowerCase().includes(query.toLowerCase()) && (plan === "all" || p.plan.toLowerCase() === plan));
  el.innerHTML = visible.map(p => '<article class="developer-card" data-person="' + esc(p.handle) + '" tabindex="0" role="button"><div class="developer-head"><span class="developer-avatar">' + esc(p.initials) + '</span><div><b>' + esc(p.name) + '</b><small>' + esc(p.handle) + ' · ' + esc(p.role) + '</small></div></div><p>Contributing to the BSMS Web ecosystem.</p><div class="developer-stats"><span>' + p.branches.length + ' branches</span><b>' + p.total + ' deployments</b></div><div class="developer-card-footer">View developer profile ' + icon("arrow-right") + '</div></article>').join("") || '<div class="empty-state">No developers match your search.</div>';
}
function showPerson(handle) {
  const p = state.people.find(x => x.handle === handle); if (!p) return;
  modal(p.name, "Public developer profile · Sample information only.", '<div class="developer-profile-modal"><div class="developer-avatar">' + esc(p.initials) + '</div><div><b>' + esc(p.name) + '</b><small>' + esc(p.handle) + ' · ' + esc(p.role) + '</small></div></div><div class="modal-data"><div><span>Plan</span><b>' + esc(p.plan) + '</b></div><div><span>Assigned branches</span><b>' + p.branches.length + '</b></div><div><span>Branches</span><b>' + esc(p.branches.join(", ")) + '</b></div><div><span>Total deployments</span><b>' + p.total + '</b></div><div><span>Successful deployments</span><b>' + p.success + '</b></div><div><span>Success rate</span><b>' + (p.total ? (p.success / p.total * 100).toFixed(1) : "0.0") + '%</b></div><div><span>Pull requests</span><b>' + p.prs + '</b></div></div><div class="modal-callout neutral-callout">Public profiles show developer activity and assigned branch names. Billing balances, payment records, credentials, and private account data are not shown.</div>', "Close profile", closeModal, {icon:"person"});
}
function renderAdmin() {
  const c = $("#adminContent"); if (!c) return;
  const tabs = $$(".admin-tabs [data-admin]");
  tabs.forEach(b => b.classList.toggle("active", b.dataset.admin === state.adminTab));
  const row = (a,b,action,label) => '<div class="admin-line"><b>' + a + '</b><span>' + b + (action ? ' <button class="text-button" data-admin-action="' + action + '">' + (label || "Manage →") + '</button>' : '') + '</span></div>';
  let html = "";
  if (state.adminTab === "dashboard") {
    html = '<div class="admin-kpis"><div class="admin-kpi"><span>Developer accounts</span><b>' + state.people.length + '</b></div><div class="admin-kpi"><span>Deployments today</span><b>' + state.deployments.filter(d => d.created.startsWith("Today")).length + '</b></div><div class="admin-kpi"><span>Active Pro plans</span><b>' + state.people.filter(p => p.plan === "Pro" && p.enabled).length + '</b></div><div class="admin-kpi"><span>Queued deployments</span><b>02</b></div></div><div class="admin-box"><h3>System overview</h3>' + row("Vercel deployment API","Operational · Simulated") + row("GitHub integration","Connected · Simulated") + row("Usage accounting","Local preview data") + row("Developer authentication","Not connected · Demo") + '</div><div class="admin-box"><h3>Recent administrative activity</h3>' + state.audit.slice(0,4).map(a => row(esc(a.title),esc(a.detail))).join("") + '</div>';
  } else if (state.adminTab === "developers") {
    html = '<div class="admin-box"><div class="panel-heading"><div><h3>Developer accounts</h3><p>Manage sample access, plan assignments, and branch visibility.</p></div><button class="button primary" data-admin-action="add-developer">Add developer</button></div>' + state.people.map(p => row(esc(p.name) + ' <small>' + esc(p.handle) + '</small>', esc(p.plan) + ' · ' + (p.enabled ? "Enabled" : "Disabled") + ' · ' + p.branches.length + ' branches', "developer:" + p.handle, "Manage →")).join("") + '</div>';
  } else if (state.adminTab === "branches") {
    html = '<div class="admin-box"><h3>Branch assignments & destinations</h3>' + state.branches.map(b => row(esc(b.name) + ' · ' + esc(b.purpose), esc(b.url) + ' · ' + b.assignees.length + ' developers', "branch:" + b.name, "Edit →")).join("") + '<button class="button primary" data-admin-action="add-branch">Add branch</button></div>';
  } else if (state.adminTab === "deployments") {
    html = '<div class="admin-box"><h3>Deployment oversight</h3>' + state.deployments.slice(0,12).map(d => row(esc(d.branch) + ' · ' + esc(d.sha), esc(d.status.toUpperCase()) + ' · ' + esc(d.created), "deployment:" + d.id, "Inspect →")).join("") + '</div>';
  } else if (state.adminTab === "plans" || state.adminTab === "billing") {
    html = '<div class="admin-box"><div class="panel-heading"><div><h3>Plan configuration</h3><p>Sample global plan values.</p></div><button class="button secondary" data-admin-action="edit-plans">Edit limits</button></div>' + row("Basic hourly / daily / weekly", state.limits.hourly + " / " + state.limits.daily + " / " + state.limits.weekly) + row("Pro included / maximum", state.limits.included + " / " + state.limits.max) + row("Additional deployment price", money(state.limits.price)) + row("Billing renewal day","21st of each month") + '</div><div class="admin-box"><h3>Payment and grace-period management</h3>' + state.people.filter(p => p.plan === "Pro").map(p => row(esc(p.name), money(p.balance) + (p.balance ? " outstanding" : " paid"), "billing:" + p.handle, "Manage billing →")).join("") + '<button class="button primary" data-admin-action="record-payment">Record a payment</button><button class="button secondary" data-admin-action="grace-period">Manage grace periods</button></div>';
  } else if (state.adminTab === "permissions") {
    html = '<div class="admin-box"><h3>Role permissions</h3>' + row("Developer","Deploy assigned branches · View own usage") + row("Moderator","View developers · No billing access") + row("Administrator","Manage branches, plans, and access") + row("Owner","Full administrative access") + '<button class="button secondary" data-admin-action="permissions">Edit permission matrix</button></div>';
  } else if (state.adminTab === "settings") {
    html = '<div class="admin-box"><h3>Global portal settings</h3>' + row("Deployment warning threshold",state.limits.warning + "%") + row("Basic limits",state.limits.hourly + " / " + state.limits.daily + " / " + state.limits.weekly) + row("Pro included / maximum",state.limits.included + " / " + state.limits.max) + row("Extra deployment price",money(state.limits.price)) + '<button class="button primary" data-admin-action="edit-plans">Edit global settings</button></div>';
  } else {
    html = '<div class="admin-box"><h3>Audit log</h3>' + state.audit.map(a => row(esc(a.title),esc(a.detail))).join("") + '</div>';
  }
  c.innerHTML = html;
}
function audit(title) { state.audit.unshift({title,detail:"Just now · Administrator (demo)"}); }
function openBranch(name) {
  const b = state.branches.find(x => x.name === name); if (!b) return;
  modal(name + " branch details","Source control and deployment target information.",'<div class="modal-data"><div><span>Branch</span><b>' + esc(b.name) + '</b></div><div><span>Purpose</span><b>' + esc(b.purpose) + '</b></div><div><span>Latest commit</span><b>' + esc(b.sha) + '</b></div><div><span>Commit message</span><b>' + esc(b.message) + '</b></div><div><span>Latest deployment</span><b>' + esc(b.last) + '</b></div><div><span>Destination</span><b>' + esc(b.url) + '</b></div><div><span>Assigned developers</span><b>' + esc(b.assignees.join(", ")) + '</b></div></div><div class="demo-links"><a href="https://github.com/BSMS-Web-App/web/tree/' + encodeURIComponent(b.name) + '" target="_blank" rel="noopener">Open GitHub branch ↗</a> · <a href="https://' + esc(b.url) + '" target="_blank" rel="noopener">Open preview site ↗</a></div>',"View deployments",() => {closeModal();state.deploymentFilter="all";go("deployments");}, {icon:"git-branch"});
}
function canDeploy(branch) {
  if (state.plan === "Basic") {
    const key = [["hourly",state.limits.hourly],["daily",state.limits.daily],["weekly",state.limits.weekly]].find(([k,max]) => state.usage[k] >= max);
    if (key) { modal("Deployment limit reached","Your Basic plan has reached a rolling deployment limit.",limitBody(key[0]),"Understood",closeModal,{icon:"alert"}); return false; }
  } else {
    if (state.usage.suspended) { toast("Deployment access suspended","An administrator has suspended this Pro account in the demo."); return false; }
    if (state.usage.balance > 0 && state.usage.graceEnd < "2026-11-21") { toast("Payment required","The sample grace period has expired."); return false; }
    if (state.usage.totalCycle >= state.limits.max) { toast("Cycle maximum reached","The Pro plan is capped at " + state.limits.max + " deployments per cycle."); return false; }
  }
  const b = state.branches.find(x => x.name === branch);
  if (b && state.deployments.some(d => d.branch === branch && d.sha === b.sha && d.env === "Preview" && d.status === "ready")) {
    modal("Commit already deployed","This exact commit was already deployed successfully to this branch and environment.",'<div class="modal-data"><div><span>Branch</span><b>' + esc(branch) + '</b></div><div><span>Commit SHA</span><b>' + esc(b.sha) + '</b></div><div><span>Target</span><b>Preview</b></div></div><div class="modal-callout">Duplicate successful deployments are blocked. A failed attempt can be retried.</div>',"Close",closeModal,{icon:"alert"}); return false;
  }
  return true;
}
function limitBody(which) {
  return ["hourly","daily","weekly"].map(k => '<div class="limit-row"><div><b>' + ({hourly:"Hourly",daily:"Daily",weekly:"Weekly"}[k]) + ' limit</b><span>' + state.usage[k] + ' / ' + state.limits[k] + '</span></div><div class="progress ' + (state.usage[k] >= state.limits[k] ? "blocked" : "") + '"><i style="width:' + Math.min(100,state.usage[k]/state.limits[k]*100) + '%"></i></div></div>').join("") + '<div class="modal-callout">A new deployment becomes available when an older deployment leaves the rolling window.</div>';
}
function deploy(name) {
  const b = state.branches.find(x => x.name === name); if (!b || !canDeploy(name)) return;
  const duplicate = state.deployments.some(d => d.branch === name && d.sha === b.sha && d.env === "Preview" && d.status === "ready");
  const used = state.plan === "Basic" ? "Basic · Free" : "Pro · " + state.usage.proCycle + " / " + state.limits.included + " included";
  const body = '<div class="deploy-review"><div class="deploy-target"><span class="deploy-target-icon">' + icon("git-branch") + '</span><div><small>DEPLOYMENT TARGET</small><b>' + esc(b.name) + '</b><a href="https://' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(b.url) + '</a></div><span class="status-pill ready">PREVIEW</span></div><div class="modal-data"><div><span>Repository</span><b>BSMS-Web-App / web</b></div><div><span>GitHub branch</span><b>web/tree/' + esc(b.name) + '</b></div><div><span>Latest commit</span><b>' + esc(b.sha) + '</b></div><div><span>Commit message</span><b>' + esc(b.message) + '</b></div><div><span>Environment</span><b>Preview</b></div><div><span>Requested by</span><b>Leo Placencia</b></div></div><section class="deploy-usage"><div class="deploy-usage-heading"><b>Deployment allowance</b><span>' + used + '</span></div>' + limitBody("hourly") + '</section><div class="modal-callout neutral-callout">Demo simulation only. No Vercel request will be made. The real service must revalidate permissions, rate limits, duplicate commits, and plan restrictions on the server.</div><div class="duplicate-demo"><b>Duplicate protection</b><p>Successful commits cannot be deployed twice to the same branch and environment. Failed attempts can be retried.</p><div class="demo-links"><button class="text-button" id="previewLimit">Preview blocked limit state</button></div></div></div>';
  modal("Review deployment","Review the branch, commit, destination, and usage before confirming.",body,"Confirm demo deployment",() => startDeployment(b),{icon:"rocket"});
  $("#previewLimit").onclick = () => modal("Deployment limit reached","The hourly rolling limit has been exhausted.",limitBody("hourly"),"Got it",closeModal,{icon:"alert"});
}
const stages = ["Validating request","Initializing","Queued","Preparing","Building","Processing","Deploying","Finalizing"];
const logLines = b => ["[portal] Demo deployment request accepted","[checks] Branch assignment verified (sample)","[checks] Rolling limits available (sample)","[git] Resolving commit " + b.sha,"[build] Installing dependencies","[build] Running production build","[output] Preparing preview deployment","[complete] Sample deployment ready"];
function startDeployment(b) {
  closeModal(); state.activeDeployment = b; demoStartedAt = Date.now(); demoStage = 0; demoLogIndex = 0;
  const body = '<div class="deployment-live"><div class="live-orbit"><span></span><span></span><span></span><div>' + icon("rocket") + '</div></div><span class="eyebrow">SIMULATED DEPLOYMENT</span><h2 id="demoStageTitle">' + stages[0] + '</h2><p>Working through a local sample deployment. No request is sent to Vercel.</p><div class="deployment-meta"><div><small>BRANCH</small><b>' + esc(b.name) + '</b></div><div><small>COMMIT</small><b>' + esc(b.sha) + '</b></div><div><small>ELAPSED</small><b id="demoElapsed">0s</b></div></div><div class="stage-track">' + stages.map((s,i) => '<div class="stage-step ' + (i === 0 ? "current" : "") + '"><i></i><span>' + s + '</span></div>').join("") + '</div><details class="build-logs" open><summary><span>' + icon("terminal") + ' Build output</span><span>DEMO LOGS</span></summary><pre id="demoLogs"></pre></details></div>';
  modal("Deployment in progress","The sequence continues only while this preview is open.",body,"Cancel preview",cancelDeployment,{icon:"rocket",hideX:true});
  $(".modal-actions").innerHTML = '<button class="button secondary" id="cancelDeployment">Cancel preview</button><button class="button secondary" id="previewFailure">Preview failure</button>';
  $("#cancelDeployment").onclick = cancelDeployment;
  $("#previewFailure").onclick = () => finishFailure();
  addDemoLog();
  demoTimer = window.setInterval(() => {
    demoStage = Math.min(demoStage + 1, stages.length - 1);
    $("#demoStageTitle").textContent = stages[demoStage];
    $("#demoElapsed").textContent = Math.floor((Date.now()-demoStartedAt)/1000) + "s";
    $$(".stage-step").forEach((el,i) => {el.classList.toggle("done",i<demoStage);el.classList.toggle("current",i===demoStage);});
    addDemoLog();
    if (demoStage === stages.length - 1) {
      clearInterval(demoTimer); demoTimer = null;
      state.modalTimer = window.setTimeout(finishSuccess,700);
    }
  },850);
}
function addDemoLog() {
  const logs = $("#demoLogs"); if (!logs) return;
  const lines = logLines(state.activeDeployment);
  if (demoLogIndex < lines.length) { logs.textContent += lines[demoLogIndex++] + "\n"; logs.scrollTop = logs.scrollHeight; }
}
function cancelDeployment() {
  if (demoTimer) {clearInterval(demoTimer);demoTimer=null;}
  if (state.modalTimer) {clearTimeout(state.modalTimer);state.modalTimer=null;}
  modal("Preview canceled","The simulated deployment was canceled. No deployment record was created.",'<div class="modal-callout neutral-callout">Canceled previews do not consume the sample deployment allowance.</div>',"Close",closeModal,{icon:"x"});
}
function finishSuccess() {
  const b = state.activeDeployment; if (!b) return;
  const seconds = Math.max(1,Math.floor((Date.now()-demoStartedAt)/1000));
  const now = new Date().toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  const record = {status:"ready",branch:b.name,sha:b.sha,message:b.message,env:"Preview",created:"Just now · " + now,duration:seconds+"s",author:"Leo Placencia",id:Math.max(0,...state.deployments.map(d=>d.id))+1};
  state.deployments.unshift(record); b.last = "Just now"; state.usage.hourly++;state.usage.daily++;state.usage.weekly++;
  if (state.plan === "Pro") {state.usage.totalCycle++;if(state.usage.proCycle<state.limits.included)state.usage.proCycle++;else {state.usage.extra++;state.usage.balance+=state.limits.price;}}
  currentPerson().total++;currentPerson().success++;audit("Demo deployment completed · " + b.name);
  updateUsage();renderDeployments();renderAdmin();
  modal("Deployment completed","The local simulation finished successfully.",'<div class="completion-state"><div class="completion-mark">' + icon("check-circle-fill") + '</div><span class="eyebrow">SIMULATION COMPLETE</span><h2>Deployment ready</h2><p>This is a sample success screen. No website was deployed.</p><div class="modal-data"><div><span>Branch</span><b>' + esc(b.name) + '</b></div><div><span>Commit</span><b>' + esc(b.sha) + '</b></div><div><span>Destination</span><b>' + esc(b.url) + '</b></div><div><span>Duration</span><b>' + seconds + ' seconds</b></div></div></div>',"Continue",() => {closeModal();toast("Demo deployment saved","Sample history and usage counters were updated locally.");},{icon:"check-circle"});
  $(".modal-actions").innerHTML = '<button class="button secondary" id="successClose">Close</button><button class="button primary" id="successHistory">View deployment history</button>';
  $("#successClose").onclick = () => {closeModal();toast("Demo deployment saved","Sample data was updated locally.");};
  $("#successHistory").onclick = () => {closeModal();go("deployments");};
}
function finishFailure() {
  if (demoTimer) {clearInterval(demoTimer);demoTimer=null;}
  const b = state.activeDeployment, seconds = Math.max(1,Math.floor((Date.now()-demoStartedAt)/1000));
  const record = {status:"error",branch:b.name,sha:b.sha,message:b.message,env:"Preview",created:"Just now",duration:"Failed",author:"Leo Placencia",id:Math.max(0,...state.deployments.map(d=>d.id))+1};
  state.deployments.unshift(record);audit("Demo deployment failed · " + b.name);renderDeployments();renderAdmin();
  modal("Deployment failed","Inspect the sample build output or retry the failed deployment.",'<div class="failure-state"><div class="failure-mark">' + icon("alert") + '</div><span class="eyebrow">SIMULATED FAILURE</span><h2>Deployment failed</h2><p>No real deployment was attempted.</p><div class="modal-data"><div><span>Branch</span><b>' + esc(b.name) + '</b></div><div><span>Commit</span><b>' + esc(b.sha) + '</b></div><div><span>Elapsed time</span><b>' + seconds + ' seconds</b></div><div><span>Error</span><b>Sample build command returned a non-zero status</b></div></div><details class="build-logs" open><summary>Sample error output</summary><pre>[build] Compiling application...\n[build] Error: sample compilation failure\n[portal] Deployment marked as failed</pre></details></div>',"Retry demo",() => startDeployment(b),{icon:"alert"});
  $(".modal-actions").innerHTML = '<button class="button secondary" id="failureClose">Close</button><button class="button primary" id="failureRetry">Retry demo</button>';
  $("#failureClose").onclick=closeModal;$("#failureRetry").onclick=()=>startDeployment(b);
}
function exportCSV() {
  const headers = ["status","branch","commit","message","environment","created","duration","author"];
  const rows = state.deployments.map(d => headers.map(k => '"' + String(k==="commit"?d.sha:k==="message"?d.message:k==="environment"?d.env:d[k] ?? "").replace(/"/g,'""') + '"').join(","));
  const blob = new Blob([[headers.join(","),...rows].join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="bsms-deployment-history-demo.csv";a.click();URL.revokeObjectURL(url);toast("CSV exported","Downloaded sample deployment history.");
}
function exportBilling() {
  if (state.plan === "Basic" && state.planView !== "pro") {toast("No Basic billing ledger","Basic is free and has no payment history.");return;}
  const csv="date,description,amount,status\nNov 21,Additional deployment,0.10,Recorded\nNov 20,Manual payment,-0.30,Paid\n";
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"})),a=document.createElement("a");a.href=url;a.download="bsms-demo-billing-history.csv";a.click();URL.revokeObjectURL(url);toast("Billing export ready","Downloaded sample billing data.");
}
function showPlanView(view) {
  state.planView=view;
  $$("[data-plan-view]").forEach(b=>b.classList.toggle("active",b.dataset.planView===view));
  const pro=view==="pro";
  $("#proBillingPreview").hidden=!pro;$(".billing-overview").hidden=pro;
  ["#planComparisonHeading","#planGrid","#billingHistoryHeading","#basicBillingHistory"].forEach(sel=>{const el=$(sel);if(el)el.hidden=pro;});
}
function showUpgrade() {
  modal("Upgrade to Pro","Use a demo-only verification value. Never enter your real BSMS Web password here.",'<div class="upgrade-summary"><div class="pro-price">$0.10 <small>per additional deployment</small></div><ul><li>20 included deployments per billing cycle</li><li>$0.10 per additional deployment</li><li>200 total deployments maximum per cycle</li><li>Basic rolling limits still apply</li><li>Billing cycle renews on the 21st</li></ul></div><label class="demo-password-label">Demo verification value<input id="demoVerify" type="text" placeholder="Enter any sample value" autocomplete="off"></label><div class="modal-callout neutral-callout">This is not connected to authentication. Enter any non-empty sample value to preview the confirmation state.</div>',"Continue",() => {
    const val=$("#demoVerify").value.trim();if(!val){toast("Enter a demo value","This field is required only to preview the flow.");return;}
    modal("Pro request ready","The sample verification step passed. No plan was changed.",'<div class="modal-callout neutral-callout">In production, server-side password verification and administrator approval would happen before the account changes.</div>',"Done",closeModal,{icon:"check-circle"});
  },{icon:"shield-check"});
}
function editProfile() {
  const p=currentPerson();
  modal("Edit developer profile","Update the sample profile fields. Changes remain local to this preview.",'<form id="profileForm" class="demo-form"><label>Display name<input name="name" value="' + esc(p.name) + '" required></label><label>Username<input name="handle" value="' + esc(p.handle) + '" required></label><label>Display role<select name="role"><option ' + (p.role==="Developer"?"selected":"") + '>Developer</option><option ' + (p.role==="Moderator"?"selected":"") + '>Moderator</option><option ' + (p.role==="Administrator"?"selected":"") + '>Administrator</option></select></label></form>',"Save changes",() => {
    const f=$("#profileForm");if(!f.reportValidity())return;
    p.name=f.elements.name.value.trim();p.handle=f.elements.handle.value.trim().startsWith("@")?f.elements.handle.value.trim():"@"+f.elements.handle.value.trim();p.role=f.elements.role.value;p.initials=p.name.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase();state.profileHandle=p.handle;
    $("#page-profile h2").textContent=p.name;$("#page-profile .profile-card p").textContent=p.handle+" · "+p.role;$(".profile-copy b").textContent=p.name;$(".profile-copy small").textContent=p.plan+" developer";audit("Developer profile updated");closeModal();toast("Profile updated","The sample profile was updated locally.");
  },{icon:"person"});
}
function adminAction(action) {
  if (action === "add-developer") {
    modal("Add developer","Create a sample developer record. No BSMS Web account is created.",'<form id="addDeveloperForm" class="demo-form"><label>Full name<input name="name" required></label><label>Username<input name="handle" placeholder="@username" required></label><label>Plan<select name="plan"><option>Basic</option><option>Pro</option></select></label></form>',"Add developer",() => {
      const f=$("#addDeveloperForm");if(!f.reportValidity())return;const name=f.elements.name.value.trim(),handle=f.elements.handle.value.trim().startsWith("@")?f.elements.handle.value.trim():"@"+f.elements.handle.value.trim();
      if(state.people.some(p=>p.handle.toLowerCase()===handle.toLowerCase())){toast("Username already exists","Choose a unique sample username.");return;}
      state.people.push({initials:name.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase(),name,handle,role:"Developer",plan:f.elements.plan.value,branches:[],total:0,success:0,prs:0,enabled:true,balance:0});audit("Developer added · "+handle);closeModal();renderAdmin();toast("Developer added","A sample developer record was created.");
    },{icon:"person-add"});
  } else if (action === "add-branch") {
    modal("Add branch","Add a sample branch and its preview destination.",'<form id="addBranchForm" class="demo-form"><label>Branch name<input name="name" placeholder="dev4" required></label><label>Purpose<input name="purpose" required></label><label>Preview hostname<input name="url" placeholder="dev4.bsms-web.com" required></label></form>',"Add branch",() => {
      const f=$("#addBranchForm");if(!f.reportValidity())return;const name=f.elements.name.value.trim();if(state.branches.some(b=>b.name===name)){toast("Branch exists","Choose another branch name.");return;}
      state.branches.push({name,purpose:f.elements.purpose.value.trim(),sha:"d9e5a12",message:"Initial demo commit",last:"Not deployed",status:"Ready",assignees:[],url:f.elements.url.value.trim()});audit("Branch created · "+name);closeModal();renderAdmin();renderBranches();toast("Branch added","Sample branch created locally.");
    },{icon:"git-branch"});
  } else if (action.startsWith("developer:")) {
    const p=state.people.find(x=>x.handle===action.slice(10));if(!p)return;
    modal("Manage "+p.name,"Change sample access, plan, and assigned branches.",'<form id="manageDeveloperForm" class="demo-form"><label>Plan<select name="plan"><option ' +(p.plan==="Basic"?"selected":"")+'>Basic</option><option ' +(p.plan==="Pro"?"selected":"")+'>Pro</option></select></label><label>Access<select name="enabled"><option value="true" '+(p.enabled?"selected":"")+'>Enabled</option><option value="false" '+(!p.enabled?"selected":"")+'>Disabled</option></select></label><fieldset><legend>Assigned branches</legend>'+state.branches.map(b=>'<label class="check-row"><input type="checkbox" name="branches" value="'+esc(b.name)+'" '+(p.branches.includes(b.name)?"checked":"")+'> '+esc(b.name)+'</label>').join("")+'</fieldset></form>',"Save developer",() => {
      const f=$("#manageDeveloperForm");p.plan=f.elements.plan.value;p.enabled=f.elements.enabled.value==="true";p.branches=Array.from(f.querySelectorAll('input[name="branches"]:checked')).map(x=>x.value);audit("Developer access updated · "+p.handle);closeModal();renderAdmin();toast("Developer updated","Plan and branch assignments changed in demo data.");
    },{icon:"person"});
  } else if (action.startsWith("branch:")) {
    const b=state.branches.find(x=>x.name===action.slice(7));if(!b)return;
    modal("Edit "+b.name,"Change the branch destination and developer assignments.",'<form id="manageBranchForm" class="demo-form"><label>Purpose<input name="purpose" value="'+esc(b.purpose)+'" required></label><label>Preview hostname<input name="url" value="'+esc(b.url)+'" required></label><fieldset><legend>Assigned developers</legend>'+state.people.map(p=>'<label class="check-row"><input type="checkbox" name="assignees" value="'+esc(p.handle)+'" '+(b.assignees.includes(p.handle)?"checked":"")+'> '+esc(p.name)+'</label>').join("")+'</fieldset></form>',"Save branch",() => {
      const f=$("#manageBranchForm");if(!f.reportValidity())return;b.purpose=f.elements.purpose.value.trim();b.url=f.elements.url.value.trim();b.assignees=Array.from(f.querySelectorAll('input[name="assignees"]:checked')).map(x=>x.value);state.people.forEach(p=>{p.branches=p.branches.filter(n=>n!==b.name);if(b.assignees.includes(p.handle))p.branches.push(b.name);});audit("Branch mapping updated · "+b.name);closeModal();renderAdmin();renderBranches();toast("Branch updated","Sample branch mapping saved.");
    },{icon:"git-branch"});
  } else if (action.startsWith("deployment:")) deploymentDetail(action.slice(11));
  else if (action === "edit-plans") {
    modal("Plan configuration","Adjust the sample limits and Pro pricing.",'<form id="planForm" class="demo-form"><label>Basic hourly limit<input type="number" min="1" name="hourly" value="'+state.limits.hourly+'"></label><label>Basic daily limit<input type="number" min="1" name="daily" value="'+state.limits.daily+'"></label><label>Basic weekly limit<input type="number" min="1" name="weekly" value="'+state.limits.weekly+'"></label><label>Pro included deployments<input type="number" min="0" name="included" value="'+state.limits.included+'"></label><label>Pro cycle maximum<input type="number" min="1" name="max" value="'+state.limits.max+'"></label><label>Extra deployment price ($)<input type="number" min="0" step="0.01" name="price" value="'+state.limits.price.toFixed(2)+'"></label><label>Warning threshold (%)<input type="number" min="1" max="100" name="warning" value="'+state.limits.warning+'"></label></form>',"Save configuration",() => {
      const f=$("#planForm");if(!f.reportValidity())return;["hourly","daily","weekly","included","max","price","warning"].forEach(k=>state.limits[k]=Number(f.elements[k].value));audit("Global plan settings updated");closeModal();renderAdmin();updateUsage();toast("Plan settings saved","Sample configuration updated.");
    },{icon:"gear"});
  } else if (action === "record-payment" || action === "grace-period" || action.startsWith("billing:")) {
    const p=action.startsWith("billing:")?state.people.find(x=>x.handle===action.slice(8)):state.people.find(x=>x.plan==="Pro");
    if(!p)return;
    if(action==="grace-period"){
      modal("Manage grace period","Set a sample grace-period date or suspend Pro deployment access.",'<form id="graceForm" class="demo-form"><label>Grace-period end<input type="date" name="end" value="'+state.usage.graceEnd+'"></label><label class="check-row"><input type="checkbox" name="suspended" '+(state.usage.suspended?"checked":"")+'> Suspend Pro deployments</label></form>',"Save grace period",() => {const f=$("#graceForm");state.usage.graceEnd=f.elements.end.value;state.usage.suspended=f.elements.suspended.checked;audit("Pro grace period updated");closeModal();renderAdmin();toast("Grace period saved","Sample billing restrictions updated.");},{icon:"clock"});
    } else {
      modal("Record payment · "+p.name,"Record a full or partial manual payment in the sample ledger.",'<div class="modal-data"><div><span>Current balance</span><b>'+money(p.balance)+'</b></div></div><form id="paymentForm" class="demo-form"><label>Payment amount ($)<input name="amount" type="number" min="0.01" step="0.01" max="'+Math.max(0.01,p.balance||10)+'" value="'+(p.balance||0.70).toFixed(2)+'" required></label><label>Reference / note<input name="note" placeholder="Manual payment reference"></label></form>',"Record payment",() => {const f=$("#paymentForm");if(!f.reportValidity())return;const amount=Number(f.elements.amount.value);if(amount<=0)return;p.balance=Math.max(0,p.balance-amount);if(p.handle===state.profileHandle)state.usage.balance=p.balance;audit("Manual payment recorded · "+p.handle+" · "+money(amount));closeModal();renderAdmin();toast("Payment recorded","Sample balance is now "+money(p.balance)+".");},{icon:"credit-card"});
    }
  } else if (action === "permissions") {
    modal("Permission matrix","Review and adjust simulated role capabilities.",'<div class="permission-grid"><div><b>Capability</b><b>Developer</b><b>Moderator</b><b>Admin</b></div>'+["Deploy assigned branches","View developer profiles","Manage branch assignments","Manage billing","Change global limits","View audit log"].map((x,i)=>'<div><span>'+x+'</span>'+[0,1,2].map(j=>'<label><input type="checkbox" '+((j===0&&i<2)||(j===1&&i<2)||(j===2)?"checked":"")+'></label>').join("")+'</div>').join("")+'</div><div class="modal-callout neutral-callout">Permission edits are preview-only and do not change real account roles.</div>',"Save matrix",() => {audit("Permission matrix preview saved");closeModal();toast("Permission matrix saved","Demo-only permission state.");},{icon:"shield-lock"});
  }
}
function showSettings(key="general") {
  const sets = {
    general:["General preferences","Customize how the Developer Portal behaves.",[["deploymentNotifications","Deployment notifications","Show a notification when a deployment changes status."],["reducedMotion","Reduced motion","Reduce interface movement and animated transitions."],["compactTables","Compact tables","Use denser rows in deployment and billing tables."]]],
    notifications:["Notification preferences","Choose which events appear in your portal.",[["success","Deployment succeeded","Notify when a deployment becomes ready."],["failure","Deployment failed","Notify when a deployment fails."],["branch","Branch assignment changes","Notify when an administrator changes branch access."],["billing","Billing reminders","Notify about plan and billing events."]]],
    security:["Security & sessions","Review account security preferences.",[["loginAlerts","Login alerts","Show an alert when a new session is detected."]]]
  };
  const d=sets[key]||sets.general;
  $("#settingsContent").innerHTML="<h2>"+d[0]+"</h2><p>"+d[1]+"</p>"+d[2].map(x=>'<div class="setting-row"><div><b>'+x[1]+'</b><small>'+x[2]+'</small></div><label class="switch"><input type="checkbox" data-setting="'+x[0]+'" '+(state.settings[x[0]]?"checked":"")+'><span></span></label></div>').join("")+'<button class="button primary" id="saveSettings">Save preferences</button>';
  $("#saveSettings").onclick=()=>{ $$("[data-setting]").forEach(i=>state.settings[i.dataset.setting]=i.checked);document.body.classList.toggle("reduce-motion",state.settings.reducedMotion);document.body.classList.toggle("compact-tables",state.settings.compactTables);toast("Preferences saved","Your sample preferences were updated."); };
}
function notifications() {
  const pop=$("#notificationPopover");pop.classList.toggle("open");
  if(pop.classList.contains("open")) {
    const items=state.notices.map((n,i)=>'<div class="notification-item"><span class="notice-dot '+(n.read?"muted-dot":"")+'"></span><div><b>'+esc(n.title)+'</b><small>'+esc(n.detail)+'</small></div></div>').join("");
    pop.innerHTML='<div class="popover-head"><b>Notifications</b><button id="markRead">Mark all read</button></div>'+(items||'<div class="empty-state">No notifications.</div>')+'<div class="popover-foot">You are up to date</div>';
  }
}
function signOutPreview() {
  $("#loginPreview").classList.add("open");$("#loginPreview").setAttribute("aria-hidden","false");
}
function bindEvents() {
  document.addEventListener("click", e => {
    const page=e.target.closest("[data-page]");if(page){e.preventDefault();go(page.dataset.page);return;}
    const close=e.target.closest("[data-close]");if(close){closeModal();return;}
    const dismiss=e.target.closest("[data-dismiss]");if(dismiss){$("#"+dismiss.dataset.dismiss)?.remove();return;}
    const deployBtn=e.target.closest("[data-branch].deploy-open");if(deployBtn){deploy(deployBtn.dataset.branch);return;}
    const detail=e.target.closest("[data-branch-details],.branch-details");if(detail){openBranch(detail.dataset.branchDetails||detail.dataset.branch);return;}
    const deployRow=e.target.closest("[data-deploy]");if(deployRow){deploy(deployRow.dataset.deploy);return;}
    const person=e.target.closest("[data-person]");if(person){showPerson(person.dataset.person);return;}
    const dep=e.target.closest("[data-deployment-detail],[data-detail]");if(dep){deploymentDetail(dep.dataset.deploymentDetail||dep.dataset.detail);return;}
    const tab=e.target.closest("[data-filter]");if(tab){state.deploymentFilter=tab.dataset.filter;renderDeployments();return;}
    const admin=e.target.closest("[data-admin]");if(admin){state.adminTab=admin.dataset.admin;renderAdmin();return;}
    const adminAct=e.target.closest("[data-admin-action]");if(adminAct){adminAction(adminAct.dataset.adminAction);return;}
    const settings=e.target.closest("[data-settings]");if(settings){$$("[data-settings]").forEach(x=>x.classList.toggle("active",x===settings));showSettings(settings.dataset.settings);return;}
    const plan=e.target.closest("[data-plan-view]");if(plan){showPlanView(plan.dataset.planView);return;}
    if(e.target.closest("#notificationsBtn")){notifications();return;}
    if(e.target.closest("#markRead")){state.notices.forEach(n=>n.read=true);$("#notificationPopover").classList.remove("open");toast("Notifications marked read","All sample notifications are marked as read.");return;}
    if(e.target.closest("#branchRefresh")){renderBranches();toast("Branches refreshed","Sample branch data is up to date.");return;}
    if(e.target.closest("#exportDeployments")){exportCSV();return;}
    if(e.target.closest("#invoiceExport")){exportBilling();return;}
    if(e.target.closest("#comparePlans")){$("#planGrid").scrollIntoView({behavior:state.settings.reducedMotion?"auto":"smooth"});toast("Plan comparison","Basic and Pro details are shown below.");return;}
    if(e.target.closest("#proRequest")){showUpgrade();return;}
    if(e.target.closest("#editProfile")){editProfile();return;}
    if(e.target.closest("#showLogin")){signOutPreview();return;}
    if(e.target.closest("#previewSignIn")){$("#loginPreview").classList.remove("open");$("#loginPreview").setAttribute("aria-hidden","true");toast("Preview session","No credentials were checked.");return;}
    if(e.target.closest("#closeFailure")){closeModal();return;}
  });
  document.addEventListener("input",e=>{
    if(e.target.id==="branchSearch")renderBranches(e.target.value);
    if(e.target.id==="deploymentSearch")renderDeployments();
    if(e.target.id==="developerSearch")renderPeople(e.target.value);
  });
  document.addEventListener("change",e=>{
    if(e.target.matches("#page-branches .select")){state.branchFilter=e.target.value==="Ready"?"ready":e.target.value==="Deployment blocked"?"blocked":"all";renderBranches();}
    if(e.target.matches("#page-directory .select"))renderPeople();
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){closeModal();$("#notificationPopover")?.classList.remove("open");}
    if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-person]")){e.preventDefault();showPerson(e.target.dataset.person);}
  });
  $("#modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal();});
  $("#notificationsBtn").addEventListener("click",e=>e.stopPropagation());
  document.addEventListener("click",e=>{if(!e.target.closest("#notificationPopover")&&!e.target.closest("#notificationsBtn"))$("#notificationPopover").classList.remove("open");});
}
function initialize() {
  // Keep the preview's sample identity and all interactive state isolated from live services.
  const me=currentPerson();
  $("#page-profile h2").textContent=me.name;$("#page-profile .profile-card p").textContent=me.handle+" · "+me.role;
  $(".profile-copy b").textContent=me.name;$(".profile-copy small").textContent=me.plan+" developer";
  $$(".branch-card").forEach(card=>{
    const name=card.querySelector("h3")?.textContent.trim(),b=state.branches.find(x=>x.name===name);if(!b)return;
    card.querySelector(".branch-meta code").textContent=b.sha;card.querySelector(".branch-meta b").textContent=b.last;
    const links=card.querySelectorAll(".branch-links a");if(links[0])links[0].href="https://github.com/BSMS-Web-App/web/tree/"+encodeURIComponent(name);if(links[1])links[1].href="https://"+b.url;
  });
  const planFilter=$("#page-directory .select");if(planFilter)planFilter.classList.add("directory-plan-filter");
  const branchFilter=$("#page-branches .select");if(branchFilter)branchFilter.setAttribute("aria-label","Filter branches by status");
  $("#heatmap").innerHTML=Array.from({length:182},(_,i)=>'<i title="Sample deployment activity · day '+(i+1)+'"></i>').join("");
  $("#githubHeatmap").innerHTML=Array.from({length:182},(_,i)=>'<i title="Sample GitHub activity · day '+(i+1)+'"></i>').join("");
  renderBranches();renderDeployments();renderPeople();renderAdmin();updateUsage();showSettings("general");bindEvents();
  document.body.classList.toggle("reduce-motion",state.settings.reducedMotion);
}
initialize();
})();