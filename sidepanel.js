(() => {
  const $ = (id) => document.getElementById(id);
  const ui = {
    folderName: $("folderName"), scanInfo: $("scanInfo"), groups: $("fileGroups"), notice: $("notice"),
    choose: $("chooseFolder"), refresh: $("refreshFiles"), fill: $("fillSelected"), capturePage: $("capturePage"), selectedCount: $("selectedCount"), readyCount: $("readyCount"),
    dialog: $("detailDialog"), dialogTitle: $("dialogTitle"), buyerName: $("buyerName"), buyer: $("buyerRaw"), skus: $("skuRows"), carrier: $("carrier"), tracking: $("tracking"), deliveryProvider: $("deliveryProvider"), detailStatus: $("detailStatus"),
    readBuyerClipboard: $("readBuyerClipboard"), focusBuyerCopy: $("focusBuyerCopy"), analyzeAddresses: $("analyzeAddresses"),
    addressReportDialog: $("addressReportDialog"), addressReport: $("addressReport"), copyAddressReport: $("copyAddressReport")
  };
  const DB_NAME = "cainiao-outbound-batch";
  let directoryHandle = null;
  let files = [];
  let selected = new Set();
  let details = new Map();
  const detailWriteQueues = new Map();
  let statuses = {};
  let editingOrder = null;
  let waitingForAck = null;

  function notify(text, kind = "") {
    ui.notice.textContent = text;
    ui.notice.className = `notice ${kind}`;
    ui.notice.hidden = !text;
  }
  function escapeHtml(value) {
    return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
  }
  function localDate(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function prettyTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", {hour:"2-digit",minute:"2-digit"}).format(new Date(timestamp));
  }
  function openDb() {
    return new Promise((resolve, reject) => {
      // DB 版本号升到 2：保留 v1 的 handles，并新增订单资料仓库。
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db=req.result;
        if(!db.objectStoreNames.contains("handles")) db.createObjectStore("handles");
        if(!db.objectStoreNames.contains("orderDetails")) db.createObjectStore("orderDetails",{keyPath:"orderId"});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("订单资料数据库升级被其他扩展页面占用，请关闭后重新打开侧栏。"));
    });
  }
  async function storeDirectory(handle) {
    const db = await openDb();
    await new Promise((resolve,reject) => { const tx=db.transaction("handles","readwrite"); tx.objectStore("handles").put(handle,"labels-directory"); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); });
    db.close();
  }
  async function loadDirectory() {
    const db = await openDb();
    const handle = await new Promise((resolve,reject) => { const req=db.transaction("handles").objectStore("handles").get("labels-directory"); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); });
    db.close(); return handle;
  }
  async function loadOrderDetails() {
    const db=await openDb();
    const records=await new Promise((resolve,reject)=>{
      const tx=db.transaction("orderDetails","readonly");
      const req=tx.objectStore("orderDetails").getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error);
      tx.onabort=()=>reject(tx.error||new Error("读取订单资料事务失败。"));
    });
    db.close();
    details=new Map(records.filter(record=>record?.orderId).map(({orderId,updatedAt,...data})=>[String(orderId),data]));
    return records.length;
  }
  async function readOrderDetailsForReport() {
    const db=await openDb();
    try {
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction("orderDetails","readonly");
        const req=tx.objectStore("orderDetails").getAll();
        req.onsuccess=()=>resolve(req.result||[]);
        req.onerror=()=>reject(req.error);
        tx.onabort=()=>reject(tx.error||new Error("读取地址统计数据失败。"));
      });
    } finally { db.close(); }
  }
  function makeAddressPatternReport(records) {
    const countryCodes=new Set("AT BE BG CH CZ DE DK EE ES FI FR GB GR HR HU IE LT LU LV NL NO PL PT RO SE SI SK".split(" "));
    const clean=value=>String(value||"").replace(/\s+/g," ").trim();
    const patterns=new Map(),countries=new Map();
    let withAddress=0,complete=0,parsed=0,needsReview=0,parseErrors=0;
    for(const record of records) {
      const buyerRaw=clean(record?.buyerRaw);
      const hasComplete=Boolean(buyerRaw&&clean(record?.skuRows)&&clean(record?.carrier)&&clean(record?.tracking));
      if(hasComplete) complete++;
      if(!buyerRaw) continue;
      withAddress++;
      const lines=String(record.buyerRaw).split(/\r?\n/).map(clean).filter(Boolean);
      const phoneRe=/^\+?\d[\d\s().-]{6,}$/;
      const phoneIndex=lines.findLastIndex(line=>phoneRe.test(line)&&line.replace(/\D/g,"").length>=7);
      const postalRe=/^(?:[A-Z]{1,2}[-\s]?)?\d[\dA-Z -]{2,9}$/i;
      const postalIndex=lines.findIndex((line,index)=>index!==phoneIndex&&postalRe.test(line)&&!phoneRe.test(line));
      const normalizedName=clean(record.buyerName).toLowerCase().replace(/[^a-z0-9]/g,"");
      const normalizedFirst=clean(lines[0]).toLowerCase().replace(/[^a-z0-9]/g,"");
      const nameLine=Boolean(normalizedName&&normalizedName===normalizedFirst);
      const addressLines=lines.filter((_,index)=>index!==phoneIndex&&index!==postalIndex&&!(nameLine&&lines[0]===lines[index]));
      const addressText=addressLines.join(" ");
      const segments=addressText.split(/[,;|]/).map(clean).filter(Boolean);
      const codeHits=[];
      for(let index=0;index<segments.length;index++) if(countryCodes.has(segments[index].toUpperCase())) codeHits.push(index);
      const country=(()=>{try{return globalThis.CainiaoAddress.parseBuyerAddress(record.buyerRaw,record.buyerName).country||"";}catch{return "";}})();
      if(country) countries.set(country,(countries.get(country)||0)+1);
      const countryPosition=codeHits.length===0?"未识别":codeHits[0]===0?"地址开头":codeHits[0]===segments.length-1?"地址末尾":"地址中间";
      let delimiter="无";
      if(addressText.includes(",")) delimiter="逗号";
      else if(addressText.includes(";")) delimiter="分号";
      else if(addressText.includes("|")) delimiter="竖线";
      let review="异常";
      try {
        const result=globalThis.CainiaoAddress.parseBuyerAddress(record.buyerRaw,record.buyerName);
        if(result.needsReview) { needsReview++; review="需人工核对"; }
        else { parsed++; review="通过"; }
      } catch { parseErrors++; }
      const key=[nameLine?"有姓名行":"无姓名行",`地址行${addressLines.length}`,`分段${segments.length}`,`国家${countryPosition}`,`邮编${postalIndex<0?"未独立成行":"独立成行"}`,`电话${phoneIndex<0?"未独立成行":"独立成行"}`,`分隔符${delimiter}`,`解析${review}`,`国家重复${codeHits.length>1?"是":"否"}`].join("｜");
      patterns.set(key,(patterns.get(key)||0)+1);
    }
    const sorted=(map)=>[...map.entries()].sort((a,b)=>b[1]-a[1]);
    const patternLines=sorted(patterns).map(([pattern,count])=>`- ${count} 单：${pattern}`);
    const countryLines=sorted(countries).map(([code,count])=>`- ${code}：${count} 单`);
    return [
      "菜鸟出库助手 · 本机 IndexedDB 地址规律统计",
      `本地订单资料：${records.length} 单；含地址：${withAddress} 单；资料完整（地址、SKU、承运商、运单号）：${complete} 单。`,
      `现有解析器：通过 ${parsed} 单；需人工核对 ${needsReview} 单；解析异常 ${parseErrors} 单。`,
      "",
      "国家代码统计（只统计解析器识别到的两位代码）：",
      ...(countryLines.length?countryLines:["- 无法识别到国家代码"]),
      "",
      "地址结构频次（仅结构标签，无地址文本）：",
      ...(patternLines.length?patternLines:["- 没有可分析的地址记录"]),
      "",
      "隐私说明：报告不包含订单号、姓名、公司、电话、邮编、街道、城市、省州或原始买家信息。"
    ].join("\n");
  }
  async function writeOrderDetails(orderId,data) {
    const db=await openDb();
    try {
      await new Promise((resolve,reject)=>{
        // readwrite 事务保证这条订单记录完整写入后再报告成功。
        const tx=db.transaction("orderDetails","readwrite");
        tx.objectStore("orderDetails").put({orderId:String(orderId),...data,updatedAt:Date.now()});
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error||new Error("IndexedDB 写入事务失败。"));
        tx.onabort=()=>reject(tx.error||new Error("IndexedDB 写入事务已中止。"));
      });
    } finally { db.close(); }
  }
  function persistOrderDetails(orderId,data) {
    const key=String(orderId),snapshot={...data};
    // 同一订单的快速连续输入按顺序写，避免较早的异步事务覆盖较新的值。
    const previous=detailWriteQueues.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(()=>writeOrderDetails(key,snapshot));
    detailWriteQueues.set(key,next);
    return next.finally(()=>{if(detailWriteQueues.get(key)===next) detailWriteQueues.delete(key);});
  }
  async function loadLocalState() {
    const saved = await chrome.storage.local.get(["selectedNames", "orderStatuses"]);
    selected = new Set(saved.selectedNames || []);
    statuses = saved.orderStatuses || {};
  }
  async function persistSelection() { await chrome.storage.local.set({selectedNames:Array.from(selected)}); }
  async function persistStatuses() { await chrome.storage.local.set({orderStatuses:statuses}); }

  async function scanDirectory(handle) {
    const pdfEntries=[];
    for await (const entry of handle.values()) if(entry.kind==="file"&&/\.pdf$/i.test(entry.name)) pdfEntries.push(entry);
    // File metadata reads are independent; parallelize them instead of waiting
    // for every local PDF one by one. No PDF contents are loaded during scan.
    const found=await Promise.all(pdfEntries.map(async entry=>{
      const file=await entry.getFile();
      return {name:entry.name,orderId:entry.name.replace(/\.pdf$/i,""),lastModified:file.lastModified,size:file.size};
    }));
    found.sort((a,b)=>b.lastModified-a.lastModified || a.name.localeCompare(b.name));
    files = found;
    let migratedFailureStatus=false;
    for(const file of files) {
      const status=statuses[file.orderId]||"";
      if(status.startsWith("失败")) {
        statuses[file.orderId]=`历史失败：${status}`;
        migratedFailureStatus=true;
      }
    }
    if(migratedFailureStatus) await persistStatuses();
    ui.folderName.textContent = handle.name || "已授权面单目录";
    ui.scanInfo.textContent = `最近扫描 ${new Intl.DateTimeFormat("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date())} · ${files.length} 个 PDF`;
    ui.refresh.disabled = false;
    // Drop selections for files which were removed from the directory.
    const present = new Set(files.map(f=>f.name));
    selected = new Set([...selected].filter(name=>present.has(name)));
    await persistSelection();
    render();
  }

  function isReady(orderId) {
    const data = details.get(orderId);
    if (!data || !data.buyerRaw || !data.tracking || !["DPD","Inpost"].includes(data.carrier)) return false;
    try { if(globalThis.CainiaoAddress.parseBuyerAddress(data.buyerRaw,data.buyerName).needsReview) return false; } catch { return false; }
    return parseSkuRows(data.skuRows).length > 0;
  }
  function parseSkuRows(text) {
    return String(text||"").split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
      const parts=line.split(/[,，\t|]/).map(x=>x.trim());
      const quantity=Number(parts[1]);
      return parts[0] && Number.isInteger(quantity) && quantity>0 ? {code:parts[0],quantity} : null;
    }).filter(Boolean);
  }
  function updateCounts() {
    const picked = files.filter(f=>selected.has(f.name));
    const ready = picked.filter(f=>isReady(f.orderId)).length;
    ui.selectedCount.textContent = `已选 ${picked.length} 单`;
    ui.readyCount.textContent = ` · ${ready} 单资料完整`;
    ui.fill.disabled = picked.length === 0;
    ui.capturePage.disabled = picked.length === 0;
    ui.fill.textContent = waitingForAck ? "我已创建，预填下一单" : "预填第一单";
  }
  function render() {
    if (!files.length) { ui.groups.innerHTML='<div class="empty-state">目录中没有 PDF 面单。你可以刷新或重新选择目录。</div>'; updateCounts(); return; }
    const groups = new Map();
    for (const file of files) { const day=localDate(file.lastModified); if(!groups.has(day)) groups.set(day,[]); groups.get(day).push(file); }
    ui.groups.innerHTML = [...groups.entries()].map(([day, rows]) => {
      const all = rows.every(f=>selected.has(f.name));
      const dayText = day === localDate(Date.now()) ? `今天 · ${day}` : day;
      return `<section class="day-group"><div class="day-head"><div class="day-title">${dayText}<small>${rows.length} 单</small></div><div class="day-actions"><button class="text-button" data-action="toggle-day" data-day="${day}">${all?"取消全选":"全选本日"}</button></div></div><div class="order-list">${rows.map(file=>renderRow(file)).join("")}</div></section>`;
    }).join("");
    updateCounts();
  }
  function renderRow(file) {
    const checked=selected.has(file.name), status=statuses[file.orderId]||"未整理", ready=isReady(file.orderId);
    const historicalFailure=status.startsWith("历史失败：");
    const failed=historicalFailure||status.startsWith("失败");
    const stateClass=status==="已创建"?"created":failed?"error":ready?"ready":"";
    const stateLabel=historicalFailure?"上次失败":failed?"预填失败":ready?"资料完整":status;
    const errorText=status.replace(/^历史失败：/,"").replace(/^失败[：:]?\s*/,"");
    const errorDetails=failed?`<div class="order-error" role="status">${historicalFailure?"历史失败记录（目录刷新时保留，仅供参考，不代表本次运行）：":"本次预填失败："}${escapeHtml(errorText)}</div>`:"";
    const orderId=escapeHtml(file.orderId),fileName=escapeHtml(file.name);
    return `<article class="order-row"><div class="order-head"><input type="checkbox" data-action="select" data-name="${fileName}" ${checked?"checked":""}><div class="order-main" data-action="expand" data-order="${orderId}"><div class="order-id">${orderId}</div><div class="order-meta">${prettyTime(file.lastModified)} · ${Math.max(1,Math.round(file.size/1024))} KB</div></div><span class="state ${stateClass}" title="${escapeHtml(status)}">${escapeHtml(stateLabel)}</span></div><div class="order-extra" id="extra-${orderId}" hidden>${errorDetails}<div class="mini-actions"><button class="mini-button" data-action="edit" data-order="${orderId}">填写/检查资料</button><button class="mini-button" data-action="capture" data-order="${orderId}">尝试读取 CSP</button><button class="mini-button" data-action="fill-one" data-order="${orderId}">预填菜鸟页面</button></div><p class="tiny-note">默认仓库：波兰仓　平台：速卖通　附件：${fileName}</p></div></article>`;
  }

  function openDetails(orderId) {
    const data=details.get(orderId)||{buyerName:"",buyerRaw:"",skuRows:"",carrier:"",tracking:"",deliveryProvider:""};
    editingOrder=orderId; ui.dialogTitle.textContent=`订单资料 · ${orderId}`; ui.buyerName.value=data.buyerName||""; ui.buyer.value=data.buyerRaw; ui.skus.value=data.skuRows; ui.carrier.value=data.carrier; ui.tracking.value=data.tracking; ui.deliveryProvider.value=data.deliveryProvider||"";
    ui.detailStatus.textContent=""; ui.detailStatus.className="form-status"; ui.dialog.showModal();
  }
  function currentDetailData() { return {buyerName:ui.buyerName.value.trim(),buyerRaw:ui.buyer.value.trim(),skuRows:ui.skus.value.trim(),carrier:ui.carrier.value,tracking:ui.tracking.value.trim(),deliveryProvider:ui.deliveryProvider.value.trim()}; }
  const clipboardKey = (text) => String(text||"").replace(/\s+/g,"").toLowerCase();
  async function importBuyerClipboardForOrder(tab,orderId,buyerName) {
    if(!navigator.clipboard?.readText) throw new Error("扩展侧边栏无法访问剪贴板 API。");
    let before="";
    try { before=await navigator.clipboard.readText(); } catch {}
    const triggered=await sendToTab(tab,{type:"CSP_FOCUS_BUYER_COPY",orderId});
    if(!triggered?.ok) throw new Error(triggered?.message||"未找到该订单的复制按钮。");
    await new Promise(resolve=>setTimeout(resolve,450));
    const copied=(await navigator.clipboard.readText()).trim();
    if(!copied) throw new Error("剪贴板没有文本，CSP 可能拦截了脚本点击。");
    const unchanged=clipboardKey(copied)===clipboardKey(before);
    const buyerMatches=buyerName&&clipboardKey(copied).includes(clipboardKey(buyerName));
    if(unchanged&&!buyerMatches) throw new Error("剪贴板内容未变化，无法确认这是当前订单的买家信息。");
    return copied;
  }
  function validateDetails() {
    const data=currentDetailData(); const problems=[];
    let parsedAddress=null;
    try { parsedAddress=globalThis.CainiaoAddress.parseBuyerAddress(data.buyerRaw,data.buyerName); if(parsedAddress.needsReview) problems.push(parsedAddress.warnings.join(" ")); } catch(e) { problems.push(e.message); }
    const lines=data.skuRows.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length || parseSkuRows(data.skuRows).length!==lines.length) problems.push("SKU 请按“商品编码,数量”逐行填写，数量须为正整数。");
    if(!data.carrier) problems.push("请选择 DPD 或 Inpost。");
    if(!data.tracking) problems.push("请填写运单号。");
    const preview=parsedAddress?["地址预览",parsedAddress.name,[parsedAddress.country,parsedAddress.state,parsedAddress.city,parsedAddress.district,parsedAddress.street].filter(Boolean).join(" / "),parsedAddress.postalCode,parsedAddress.phone].join("；"):"";
    ui.detailStatus.textContent=parsedAddress?[preview,parsedAddress.warnings.join("；")||"地址解析通过",problems.filter(problem=>!parsedAddress.warnings.includes(problem)).join(" ")].filter(Boolean).join("。"):problems.join(" ")||"地址、SKU、物流资料检查通过。";
    ui.detailStatus.className=`form-status ${parsedAddress?.needsReview?"warning":problems.length?"error":"ok"}`;
    return {ok:!problems.length,data};
  }
  async function saveDetails() {
    if(!editingOrder) return;
    const orderId=editingOrder,data=currentDetailData();
    details.set(orderId,data);
    await persistOrderDetails(orderId,data);
    ui.dialog.close(); render(); notify(`订单 ${orderId} 的资料已保存到本机 IndexedDB。`,"ok");
  }
  async function findTab(domain) {
    const tabs=await chrome.tabs.query({url:`https://${domain}/*`});
    return tabs.find(t=>t.active) || tabs[0] || null;
  }
  async function sendToTab(tab, message, targetFrameId=null) {
    const isCsp=String(message?.type||"").startsWith("CSP_");
    let firstResponse=null,firstError=null;
    try {
      firstResponse=isCsp
        ?await chrome.tabs.sendMessage(tab.id,message,{frameId:0})
        :await chrome.tabs.sendMessage(tab.id,message,targetFrameId==null?{}:{frameId:targetFrameId});
      if(firstResponse?.ok||!isCsp) return firstResponse;
    } catch(error) { firstError=error; }
    if(!isCsp) {
      try {
        const target=targetFrameId==null?{tabId:tab.id}:{tabId:tab.id,frameIds:[targetFrameId]};
        await chrome.scripting.executeScript({target,files:["address.js","content.js"]});
        return await chrome.tabs.sendMessage(tab.id,message,targetFrameId==null?{}:{frameId:targetFrameId});
      } catch(injectError) {
        throw new Error(`扩展脚本未连接，自动注入也失败：${injectError.message||firstError?.message||"请刷新页面后重试。"}`);
      }
    }
    try {
      const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>location.href});
      let lastResponse=firstResponse;
      const cspFrames=frames.filter(frame=>String(frame.result||"").startsWith("https://csp.aliexpress.com/"));
      for(const frame of cspFrames) {
        try {
          await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[frame.frameId]},files:["address.js","content.js"]});
          const response=await chrome.tabs.sendMessage(tab.id,message,{frameId:frame.frameId});
          if(response?.ok) return response;
          if(response) lastResponse=response;
        } catch(error) { firstError=firstError||error; }
      }
      if(lastResponse) return lastResponse;
      throw firstError||new Error("CSP 页面中没有可连接的扩展 frame。");
    } catch(injectError) {
      throw new Error(`CSP 页面扩展脚本未连接或无法读取页面 frame：${injectError.message||firstError?.message||"请刷新 CSP 页面后重试。"}`);
    }
  }
  async function captureFromCsp(orderId) {
    const tab=await findTab("csp.aliexpress.com");
    if(!tab) throw new Error("没有找到已打开的 CSP 标签页。");
    const response=await sendToTab(tab,{type:"CSP_CAPTURE_ORDER",orderId});
    if(!response?.ok) throw new Error(response?.message||"当前 CSP 页面未提取到订单资料。");
    const previous=details.get(orderId)||{buyerName:"",buyerRaw:"",skuRows:"",carrier:"",tracking:""};
    const updated={...previous,...response.data,buyerRaw:response.data.buyerRaw||previous.buyerRaw||""};
    details.set(orderId,updated);
    await persistOrderDetails(orderId,updated);
    render();
    return response.message||"已尝试读取 CSP。请核对买家信息和 SKU。";
  }
  async function captureSelectedFromCsp() {
    const picked=files.filter(file=>selected.has(file.name));
    if(!picked.length) throw new Error("请先勾选要匹配的面单订单。");
    const tab=await findTab("csp.aliexpress.com");
    if(!tab) throw new Error("没有找到已打开的 CSP 标签页。");
    let matched=0,addresses=0;
    const failures=[];
    const addressFailures=[];
    for(let index=0;index<picked.length;index++) {
      const file=picked[index];
      ui.capturePage.textContent=`读取 ${index+1}/${picked.length}`;
      try {
        const result=await sendToTab(tab,{type:"CSP_CAPTURE_ORDER",orderId:file.orderId});
        if(!result?.ok) { failures.push(`${file.orderId}（${result?.message||"未读取到资料"}）`); continue; }
        const previous=details.get(file.orderId)||{};
        const data=result.data||{};
        let buyerRaw=data.buyerRaw||previous.buyerRaw||"";
        matched++;
        try {
          const copied=await importBuyerClipboardForOrder(tab,file.orderId,data.buyerName||previous.buyerName||"");
          buyerRaw=copied;
          addresses++;
        } catch(error) {
          if(!buyerRaw) addressFailures.push(`${file.orderId}（${error.message||"买家信息未复制"}）`);
        }
        const updated={...previous,...data,buyerRaw};
        details.set(file.orderId,updated);
        await persistOrderDetails(file.orderId,updated);
      } catch(error) {
        failures.push(`${file.orderId}（${error.message||"读取失败"}）`);
        if(String(error.message||"").includes("自动注入也失败")) break;
      }
      // Rebuilding every order card after every capture scales poorly for a
      // large selection. Keep progress responsive, but redraw in small batches.
      if((index+1)%5===0) render();
    }
    render();
    const failureText=failures.length?`失败：${failures.join("；")}`:"";
    const addressNote=addresses===matched?"买家地址均已自动导入。":`买家地址自动导入 ${addresses}/${matched} 单${addressFailures.length?`；未导入：${addressFailures.slice(0,4).join("；")}${addressFailures.length>4?"；…":""}`:""}。未导入订单可单独打开资料，真实点击 CSP 的复制按钮后再读取剪贴板。`;
    return `已按所选订单逐单在 CSP 定位并读取 ${matched}/${picked.length} 单；${addressNote}${failureText}`;
  }
  async function fileAsBase64(fileName) {
    if(!directoryHandle) throw new Error("面单目录尚未授权。");
    const handle=await directoryHandle.getFileHandle(fileName); const file=await handle.getFile();
    const bytes=new Uint8Array(await file.arrayBuffer()); let binary=""; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    return {name:file.name,type:file.type||"application/pdf",base64:btoa(binary)};
  }
  async function fillCainiao(orderId) {
    const file=files.find(f=>f.orderId===orderId); const data=details.get(orderId);
    if(!file) throw new Error("面单文件已不在当前目录。");
    if(!data) throw new Error("请先填写订单资料。");
    const parsed=globalThis.CainiaoAddress.parseBuyerAddress(data.buyerRaw,data.buyerName);
    if(parsed.needsReview) throw new Error("地址需要人工核对，菜鸟页面尚未填写。当前解析为："+[parsed.country,parsed.state,parsed.city,parsed.district,parsed.street,parsed.postalCode].filter(Boolean).join(" / ")+"。"+parsed.warnings.join(" ")+" 请将买家地址整理为“国家代码,省/州,城市,街道”顺序后，再点“检查地址”。");
    const skuItems=parseSkuRows(data.skuRows);
    if(!skuItems.length) throw new Error("请填写至少一行商品编码和数量。");
    const pdf=await fileAsBase64(file.name);
    const tab=await findTab("b.gfn.cainiao.com");
    if(!tab) throw new Error("没有找到已打开的菜鸟页面。请打开新建出库委托单页面。");
    let frameDiagnostics=[];
    try {
      frameDiagnostics=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>{
        const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none";};
        const bodyText=document.body?.innerText||"";
        const has=text=>bodyText.includes(text);
        const modalCount=[...document.querySelectorAll('[role="dialog"],[class*="dialog"],[class*="modal"],[class*="next-overlay"]')].filter(visible).length;
        const visibleInputs=[...document.querySelectorAll("input,textarea,[role='textbox'],[contenteditable='true']")].filter(visible);
        const visibleRows=[...document.querySelectorAll('tbody tr,[role="row"],[class*="next-table-row"]')].filter(visible);
        return {url:location.href,build:globalThis.__cainiaoOutboundContentBuild||"未加载",title:document.title,isTop:window===window.top,hasWarehouse:has("出货仓库"),hasCustomerOrder:has("客户订单号"),hasPlatformOrder:has("平台订单号"),hasSkuEntry:has("选择SKU信息"),hasSkuDialog:has("每页显示")&&has("SKU编码"),visibleInputs:visibleInputs.length,inputSummary:visibleInputs.slice(0,8).map(el=>`${el.tagName.toLowerCase()}:${el.getAttribute("placeholder")||el.getAttribute("data-placeholder")||el.getAttribute("aria-label")||"无标签"}`).join(" | "),modalCount,visibleRows:visibleRows.length,skuRowCount:visibleRows.filter(row=>row.querySelector('td[data-next-table-col="1"]')).length};
      }});
    } catch(error) {
      throw new Error(`预检失败：无法枚举菜鸟标签页的 frame；停止阶段=调用页面脚本之前；tabId=${tab.id}；URL=${tab.url||"未知"}；原因=${error.message||String(error)}。请确认扩展具有菜鸟页面访问权限，或刷新菜鸟标签页后重试。`);
    }
    const cainiaoFrames=frameDiagnostics.filter(frame=>String(frame.result?.url||"").startsWith("https://b.gfn.cainiao.com/"));
    const currentBuildFrames=cainiaoFrames.filter(frame=>frame.result?.build==="1.0.5");
    const score=frame=>Number(frame.result?.hasWarehouse)+Number(frame.result?.hasCustomerOrder)+Number(frame.result?.hasPlatformOrder)+Number(frame.result?.hasSkuEntry)+Number(frame.result?.hasSkuDialog);
    const formFrame=currentBuildFrames.filter(frame=>score(frame)>0).sort((a,b)=>score(b)-score(a))[0]|| (currentBuildFrames.length===1?currentBuildFrames[0]:null);
    const frameSummary=cainiaoFrames.map(frame=>{const d=frame.result||{};return `frameId=${frame.frameId},build=${d.build||"未知"},top=${!!d.isTop},warehouse=${!!d.hasWarehouse},customerOrder=${!!d.hasCustomerOrder},platformOrder=${!!d.hasPlatformOrder},skuEntry=${!!d.hasSkuEntry},skuDialog=${!!d.hasSkuDialog},inputs=${d.visibleInputs??"?"},modals=${d.modalCount??"?"},rows=${d.visibleRows??"?"},url=${d.url||"未知"}`;}).join(" || ")||"未检测到 b.gfn.cainiao.com frame";
    if(!currentBuildFrames.length) throw new Error(`检测到菜鸟标签页没有运行当前版本内容脚本；停止阶段=调用页面脚本之前；期望版本=1.0.5；frame检测=${frameSummary}。请在 chrome://extensions 重新加载扩展，再刷新菜鸟页面；刷新会清空当前表单，请先保存或记录已填写资料。`);
    if(!formFrame) throw new Error(`已找到当前版本脚本，但多个 frame 中没有识别到菜鸟出库表单；停止阶段=选择表单 frame；${frameSummary}。请保持新建出库委托单页面打开，并把最新 frame 检测结果发回。`);
    if(score(formFrame)===0) throw new Error(`当前唯一版本脚本 frame 没有检测到出库表单关键元素；停止阶段=选择表单 frame；目标frameId=${formFrame.frameId}；${frameSummary}。页面可能还未加载完成，或表单在未获访问权限的跨域 frame 中。`);
    const response=await sendToTab(tab,{type:"CAINIAO_PREPARE_OUTBOUND",payload:{orderId,warehouse:"波兰仓",platform:"速卖通",address:parsed,skuItems,carrier:data.carrier,tracking:data.tracking,pdf}},formFrame.frameId);
    if(!response?.ok) throw new Error(response?.message||"菜鸟页面预填失败。");
    statuses[orderId]="待核对并创建"; await persistStatuses();
    waitingForAck=orderId; render();
    return (response.message||"已预填。请检查菜鸟页面并手动点击创建。")+(parsed.warnings.length?" 地址清理提示："+parsed.warnings.join("；"):"");
  }
  async function fillNext() {
    if(waitingForAck) {
      const done=files.find(f=>f.orderId===waitingForAck);
      const ok=confirm(`请确认你已经在菜鸟页面成功创建订单 ${waitingForAck}。确认后插件会记录本单并预填下一单。`);
      if(!ok) return;
      statuses[waitingForAck]="已创建"; await persistStatuses(); waitingForAck=null;
    }
    const next=files.find(f=>selected.has(f.name) && !["已创建","待核对并创建"].includes(statuses[f.orderId]) && isReady(f.orderId));
    if(!next) { render(); notify("没有资料完整且尚未处理的已选订单。请检查每单资料。","ok"); return; }
    notify(`正在预填 ${next.orderId}…`);
    try { const message=await fillCainiao(next.orderId); notify(`${next.orderId}：${message}`,"ok"); }
    catch(e) { statuses[next.orderId]=`失败：${e.message}`; await persistStatuses(); notify(e.message,"error"); render(); }
  }

  ui.choose.addEventListener("click",async()=>{
    try {
      if(!window.showDirectoryPicker) throw new Error("当前浏览器不支持目录选择 API，请使用较新版本 Chrome。");
      directoryHandle=await window.showDirectoryPicker({mode:"read",startIn:"downloads"});
      await storeDirectory(directoryHandle); await scanDirectory(directoryHandle); notify("目录读取权限已授予。","ok");
    } catch(e) { if(e.name!=="AbortError") notify(e.message||"无法打开面单目录。","error"); }
  });
  ui.refresh.addEventListener("click",async()=>{try { if(!directoryHandle) directoryHandle=await loadDirectory(); if(!directoryHandle) throw new Error("请先选择面单目录。"); const permission=await directoryHandle.queryPermission({mode:"read"}); if(permission!=="granted") { const granted=await directoryHandle.requestPermission({mode:"read"}); if(granted!=="granted") throw new Error("未获得目录读取权限。"); } await scanDirectory(directoryHandle); notify("面单列表已刷新。","ok"); } catch(e){notify(e.message,"error");}});
  ui.groups.addEventListener("click",async(event)=>{
    const target=event.target.closest("[data-action]"); if(!target) return;
    const action=target.dataset.action;
    if(action==="expand") { const order=target.dataset.order; const extra=document.getElementById(`extra-${order}`); if(extra) extra.hidden=!extra.hidden; return; }
    if(action==="edit") { openDetails(target.dataset.order); return; }
    if(action==="toggle-day") { const rows=files.filter(f=>localDate(f.lastModified)===target.dataset.day); const all=rows.every(f=>selected.has(f.name)); rows.forEach(f=>all?selected.delete(f.name):selected.add(f.name)); await persistSelection(); render(); return; }
    if(action==="capture") { const order=target.dataset.order; try { notify(await captureFromCsp(order),"ok"); openDetails(order); } catch(e){notify(e.message,"error");} return; }
    if(action==="fill-one") { const order=target.dataset.order; try { notify(await fillCainiao(order),"ok"); } catch(e){statuses[order]=`失败：${e.message}`; await persistStatuses(); render(); notify(e.message,"error");} }
  });
  ui.groups.addEventListener("change",async(event)=>{if(event.target.matches('[data-action="select"]')){const name=event.target.dataset.name; event.target.checked?selected.add(name):selected.delete(name); await persistSelection(); updateCounts();}});
  ui.fill.addEventListener("click",fillNext);
  ui.analyzeAddresses.addEventListener("click",async()=>{
    ui.analyzeAddresses.disabled=true;
    ui.analyzeAddresses.textContent="正在本机分析…";
    try {
      const records=await readOrderDetailsForReport();
      ui.addressReport.value=makeAddressPatternReport(records);
      ui.addressReportDialog.showModal();
    } catch(error) {
      notify(`读取本机 IndexedDB 地址资料失败：${error.message||error}`,"error");
    } finally {
      ui.analyzeAddresses.disabled=false;
      ui.analyzeAddresses.textContent="分析 IndexedDB 地址规律（仅生成脱敏统计）";
    }
  });
  ui.copyAddressReport.addEventListener("click",async()=>{
    ui.addressReport.focus(); ui.addressReport.select();
    try {
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(ui.addressReport.value);
      else if(!document.execCommand("copy")) throw new Error("浏览器未允许复制；请在文本框中按 Ctrl+C。");
      ui.copyAddressReport.textContent="已复制";
      setTimeout(()=>{ui.copyAddressReport.textContent="复制报告";},1500);
    } catch {
      try { if(!document.execCommand("copy")) throw new Error(); ui.copyAddressReport.textContent="已复制"; }
      catch { ui.copyAddressReport.textContent="请按 Ctrl+C"; }
    }
  });
  ui.capturePage.addEventListener("click",async()=>{ui.capturePage.disabled=true;ui.capturePage.textContent="逐单读取订单和地址…";try{notify(await captureSelectedFromCsp(),"ok");}catch(e){notify(e.message,"error");}finally{ui.capturePage.textContent="批量读取订单和地址";updateCounts();}});
  ui.dialog.addEventListener("click",(event)=>{if(event.target===ui.dialog) ui.dialog.close();});
  $("detailForm").addEventListener("submit",async(event)=>{event.preventDefault(); const result=validateDetails(); if(!result.ok)return; try{await saveDetails();}catch(error){ui.detailStatus.textContent=`本地保存失败：${error.message||error}`;ui.detailStatus.className="form-status error";}});
  // IndexedDB 自动保存草稿：关掉侧栏或资料窗口前，不必依赖手动保存按钮。
  for(const field of [ui.buyerName,ui.buyer,ui.skus,ui.carrier,ui.tracking,ui.deliveryProvider]) {
    for(const eventName of ["input","change"]) field.addEventListener(eventName,()=>{
      if(!editingOrder) return;
      const orderId=editingOrder,data=currentDetailData();
      details.set(orderId,data);
      updateCounts();
      persistOrderDetails(orderId,data).catch(error=>notify(`订单 ${orderId} 自动保存到 IndexedDB 失败：${error.message||error}`,"error"));
    });
  }
  $("parseBuyer").addEventListener("click",validateDetails);
  $("captureCsp").addEventListener("click",async()=>{if(!editingOrder)return; try { ui.detailStatus.textContent=await captureFromCsp(editingOrder); ui.detailStatus.className="form-status ok"; const data=details.get(editingOrder); if(data){ui.buyerName.value=data.buyerName||ui.buyerName.value;ui.buyer.value=data.buyerRaw||ui.buyer.value;ui.skus.value=data.skuRows||ui.skus.value;ui.carrier.value=data.firstMileProvider||data.carrier||ui.carrier.value;ui.tracking.value=data.tracking||ui.tracking.value;ui.deliveryProvider.value=data.deliveryProvider||ui.deliveryProvider.value;} } catch(e){ui.detailStatus.textContent=e.message;ui.detailStatus.className="form-status error";}});
  ui.focusBuyerCopy.addEventListener("click",async()=>{if(!editingOrder)return;try{const tab=await findTab("csp.aliexpress.com");if(!tab)throw new Error("没有找到已打开的 CSP 标签页。");const response=await sendToTab(tab,{type:"CSP_FOCUS_BUYER_COPY",orderId:editingOrder});if(!response?.ok)throw new Error(response?.message||"没有找到该订单的复制按钮。");ui.detailStatus.textContent=response.message;ui.detailStatus.className="form-status ok";}catch(e){ui.detailStatus.textContent=e.message;ui.detailStatus.className="form-status error";}});
  ui.readBuyerClipboard.addEventListener("click",async()=>{if(!editingOrder)return;try{if(!navigator.clipboard?.readText)throw new Error("当前侧边栏无法访问剪贴板 API。请手动粘贴买家信息。");const pendingRead=navigator.clipboard.readText();const copied=(await pendingRead).trim();if(!copied)throw new Error("剪贴板没有文本。请先在 CSP 页面真实点击该订单的“复制买家信息”，再点击此按钮。");ui.buyer.value=copied;const previous=details.get(editingOrder)||{};const updated={...previous,buyerRaw:copied};details.set(editingOrder,updated);await persistOrderDetails(editingOrder,updated);render();ui.detailStatus.textContent="已读取剪贴板并保存到本机 IndexedDB。请核对地址。";ui.detailStatus.className="form-status ok";}catch(e){ui.detailStatus.textContent=`读取或本地保存失败：${e.message||"请手动粘贴买家信息。"}`;ui.detailStatus.className="form-status error";}});

  (async()=>{
    await loadLocalState();
    try { const restored=await loadOrderDetails(); if(restored) notify(`已从本机 IndexedDB 恢复 ${restored} 笔订单资料。`,"ok"); }
    catch(e) { notify(`恢复本机订单资料失败：${e.message||e}`,"error"); }
    try { directoryHandle=await loadDirectory(); if(directoryHandle){ const permission=await directoryHandle.queryPermission({mode:"read"}); if(permission==="granted") await scanDirectory(directoryHandle); else {ui.folderName.textContent=directoryHandle.name||"已记录面单目录";ui.scanInfo.textContent="请点击刷新并重新授权读取";ui.refresh.disabled=false;} } }
    catch(e){notify(`加载本地目录授权失败：${e.message}`,"error");}
    render();
  })();
})();
