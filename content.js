(() => {
  const CONTENT_BUILD="1.0.0";
  if(globalThis.__cainiaoOutboundContentLoaded) return;
  globalThis.__cainiaoOutboundContentBuild=CONTENT_BUILD;
  globalThis.__cainiaoOutboundContentLoaded=true;
  const norm = (s) => String(s || "").replace(/[＊*]/g, "").replace(/\s+/g, "").trim().toLowerCase();
  const visible = (el) => { if(!el) return false; const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none"; };
  const textOf = (el) => (el?.innerText || el?.textContent || "").trim();
  const SKU_ROW_SELECTOR='tr,[role="row"],[class*="next-table-row"]';
  const SKU_SEARCH_SELECTOR="textarea,input,[role='textbox'],[contenteditable='true']";
  function deepTextOf(el) {
    if(!el) return "";
    const own=String(el.innerText||el.textContent||"");
    const shadows=deepQueryAll(el,"*").filter(node=>node.shadowRoot).map(node=>deepTextOf(node.shadowRoot));
    return [own,...shadows].filter(Boolean).join(" ").trim();
  }
  function deepQueryAll(root,selector) {
    if(!root?.querySelectorAll) return [];
    const found=[],roots=[root],seenRoots=new Set();
    while(roots.length) {
      const current=roots.shift();
      if(seenRoots.has(current)) continue;
      seenRoots.add(current);
      found.push(...current.querySelectorAll(selector));
      for(const element of current.querySelectorAll("*")) if(element.shadowRoot) roots.push(element.shadowRoot);
    }
    return [...new Set(found)];
  }
  function composedParent(element) {
    if(element?.parentElement) return element.parentElement;
    const root=element?.getRootNode?.();
    return root?.host||null;
  }
  function findSkuDialogContext() {
    const titleSelector="h1,h2,h3,h4,[role='heading'],div,span,p";
    const titles=deepQueryAll(document,titleSelector)
      .filter(element=>visible(element)&&norm(textOf(element))===norm("选择SKU信息"));
    const dialogSelector='[role="dialog"],[aria-modal="true"],[class*="dialog"],[class*="modal"],[class*="next-overlay"]:not([class*="mask"])';
    const dialogCandidates=deepQueryAll(document,dialogSelector).filter(visible);
    const matches=[];
    const stats=[];
    for(const candidate of dialogCandidates) {
      const dialogTitles=deepQueryAll(candidate,titleSelector)
        .filter(element=>visible(element)&&norm(textOf(element))===norm("选择SKU信息"));
      if(!dialogTitles.length) continue;
      const inputs=deepQueryAll(candidate,SKU_SEARCH_SELECTOR).filter(visible);
      const rows=deepQueryAll(candidate,SKU_ROW_SELECTOR).filter(visible);
      stats.push({candidate,inputs,rows,title:dialogTitles[0]});
      // 只接受真正的弹窗/overlay 容器；不再用包住弹窗和底层表单的页面 section 兜底。
      if(inputs.length&&rows.length) matches.push({modal:candidate,title:dialogTitles[0],inputs,rows});
    }
    matches.sort((a,b)=>deepQueryAll(a.modal,"*").length-deepQueryAll(b.modal,"*").length);
    if(matches.length) return {...matches[0],found:true,titles,stats};
    const diagnostic=stats.sort((a,b)=>deepQueryAll(a.candidate,"*").length-deepQueryAll(b.candidate,"*").length)[0];
    return {modal:diagnostic?.candidate||document.body,found:false,titles,inputs:diagnostic?.inputs||[],rows:diagnostic?.rows||[],stats};
  }
  const control = (el) => {
    if(!visible(el)) return false;
    const tag=el.tagName.toLowerCase(),type=(el.getAttribute("type")||"text").toLowerCase();
    return (tag==="textarea" || tag==="select" || (tag==="input"&&["text","search","tel","email","number",""].includes(type)));
  };
  function labelNodes(label) {
    const target=norm(label);
    return deepQueryAll(document,"label,div,span,p,strong,dt").filter(n=>{const t=norm(textOf(n));return t&&t.length<34&&(t===target||t.endsWith(target));});
  }
  function findControl(label) {
    for(const node of labelNodes(label)) {
      if(!visible(node)) continue;
      for(let parent=node,depth=0;parent&&depth<5;parent=parent.parentElement,depth++) {
        const inputs=[...parent.querySelectorAll("input,textarea,select")].filter(control);
        if(inputs.length){
          const nr=node.getBoundingClientRect();
          inputs.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return Math.abs(ar.top-nr.bottom)+Math.abs(ar.left-nr.left)/6-(Math.abs(br.top-nr.bottom)+Math.abs(br.left-nr.left)/6);});
          return inputs[0];
        }
      }
      const r=node.getBoundingClientRect();
      const nearby=[...document.querySelectorAll("input,textarea,select")].filter(control).map(el=>{const b=el.getBoundingClientRect();return {el,score:Math.abs(b.top-r.bottom)+Math.abs(b.left-r.left)/6,ok:b.top>=r.top-8&&Math.abs(b.left-r.left)<360};}).filter(x=>x.ok).sort((a,b)=>a.score-b.score);
      if(nearby[0]) return nearby[0].el;
    }
    return null;
  }
  function setValue(el,value) {
    const tag=el.tagName.toLowerCase(); const proto=tag==="textarea"?HTMLTextAreaElement.prototype:tag==="select"?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    const desc=Object.getOwnPropertyDescriptor(proto,"value"); if(desc?.set) desc.set.call(el,String(value)); else el.value=String(value);
    el.dispatchEvent(new Event("input",{bubbles:true})); el.dispatchEvent(new Event("change",{bubbles:true})); el.blur();
  }
  async function wait(ms=300){return new Promise(r=>setTimeout(r,ms));}
  function visibleExactText(value) {
    const target=norm(value);
    return [...document.querySelectorAll("button,[role=button],[role=option],li,span,div,a")].filter(el=>visible(el)&&norm(textOf(el))===target).sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0]||null;
  }
  function visibleExactTextWithin(root,value) {
    const target=norm(value);
    return deepQueryAll(root,"button,[role=button],[role=option],li,span,div,a").filter(el=>visible(el)&&norm(textOf(el))===target).sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0]||null;
  }
  function findClickableForLabel(label) {
    for(const node of labelNodes(label)) {
      for(let p=node,depth=0;p&&depth<5;p=p.parentElement,depth++) {
        const found=p.querySelector('select,[role="combobox"],[class*="next-select"],[class*="select"],.ant-select-selector,.el-select,.ant-picker,button');
        if(found&&visible(found)) return found;
      }
    }
    return null;
  }
  async function selectByLabel(label,value) {
    const trigger=findClickableForLabel(label)||findControl(label);
    if(trigger?.tagName.toLowerCase()==="select") {
      const option=[...trigger.options].find(o=>norm(o.textContent)===norm(value));
      if(!option) return false; trigger.value=option.value; trigger.dispatchEvent(new Event("input",{bubbles:true})); trigger.dispatchEvent(new Event("change",{bubbles:true})); await wait(300); return true;
    }
    if(!trigger) return false;
    trigger.click(); await wait(420);
    const option=visibleExactText(value);
    if(option){option.click();await wait(300);return true;}
    const search=[...document.querySelectorAll("input")].find(el=>visible(el)&&/搜索|search|请选择/i.test(`${el.placeholder} ${el.getAttribute("aria-label")||""}`));
    if(search){setValue(search,value);await wait(300);const match=visibleExactText(value);if(match){match.click();await wait(300);return true;}}
    return false;
  }
  function clickText(values) {
    const wanted=values.map(norm);
    const candidates=[...document.querySelectorAll("button,[role=button],a,span,div")].filter(el=>visible(el)&&wanted.includes(norm(textOf(el))));
    candidates.sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length);
    if(candidates[0]) { candidates[0].click(); return true; }
    return false;
  }
  function normalizeSku(value) { return String(value||"").replace(/^AE-/i,"").replace(/[^a-z0-9]/gi,"").toLowerCase(); }
  // CSP 中的 SKU 可能是平台格式（如 YD07-BLACK），菜鸟仓 SKU 使用无分隔符格式（YD07BLACK）。
  // 搜索框会把多行作为组合条件，因此每个商品只提交一个仓库格式的 SKU，不能同时提交两种写法。
  function warehouseSkuSearchCode(value) { return String(value||"").trim().replace(/^AE-/i,"").replace(/[-_.\s]/g,""); }
  function skuTokens(value) { return (String(value||"").match(/[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*/g)||[]).map(normalizeSku).filter(Boolean); }
  function rowMatchesSku(row,code) {
    const target=normalizeSku(code);
    const cells=deepQueryAll(row,"td,[role=cell]");
    const texts=(cells.length?cells:[row]).map(cell=>`${textOf(cell)} ${deepQueryAll(cell,"input").map(input=>input.value||"").join(" ")}`);
    return texts.some(text=>skuTokens(text).includes(target));
  }
  function clickCheckboxInRow(row) {
    const checkbox=deepQueryAll(row,'input[type="checkbox"],[role="checkbox"],[class*="next-checkbox-wrapper"]').find(visible)||null;
    if(!checkbox) return false;
    const checked=checkbox.checked===true||checkbox.getAttribute("aria-checked")==="true"||checkbox.className?.toString().includes("checked");
    if(!checked) (checkbox.closest("label")||checkbox).click();
    return true;
  }
  function clickSearchButtonNear(input,root) {
    for(let parent=input,depth=0;parent&&depth<5;parent=parent.parentElement,depth++) {
      const search=deepQueryAll(parent,'button,[role="button"],[aria-label*="搜索"],[class*="next-icon-search"],[class*="search-icon"],[class*="SearchIcon"],[class*="search-btn"],[class*="SearchBtn"],i,svg').filter(visible).find(el=>/search|搜索/i.test(`${el.getAttribute("class")||el.className||""} ${el.getAttribute("aria-label")||""}`));
      if(search) { search.click(); return true; }
      const textButton=visibleExactTextWithin(parent,"搜索");
      if(textButton) { textButton.click(); return true; }
      if(parent===root) break;
    }
    const fallback=deepQueryAll(root,'button,[role="button"],[aria-label*="搜索"],[class*="next-icon-search"],[class*="search-icon"],[class*="SearchIcon"],[class*="search-btn"],[class*="SearchBtn"],i,svg').filter(visible).find(el=>/search|搜索/i.test(`${el.getAttribute("class")||el.className||""} ${el.getAttribute("aria-label")||""}`));
    if(fallback) { fallback.click(); return true; }
    return false;
  }
  function findLabeledControl(label) {
    const target=norm(label);
    const candidates=labelNodes(label).filter(node=>norm(textOf(node))===target).sort((a,b)=>textOf(a).length-textOf(b).length);
    let best=null,bestScore=Infinity;
    for(const node of candidates) {
      const nr=node.getBoundingClientRect();
      for(let parent=node,depth=0;parent&&depth<4;parent=composedParent(parent),depth++) {
        const controls=deepQueryAll(parent,"input,textarea").filter(control);
        for(const el of controls) {
          const r=el.getBoundingClientRect(),vertical=r.top-nr.bottom;
          if(vertical < -12 || vertical > 100) continue;
          const score=Math.abs(vertical)+Math.abs(r.left-nr.left)/8;
          if(score<bestScore) { best=el; bestScore=score; }
        }
      }
    }
    return best;
  }
  function fillLabel(label,value) {
    const el=findLabeledControl(label)||findControl(label); if(!el) return false;
    setValue(el,value);
    return String(el.value||"").trim()===String(value||"").trim();
  }
  function decodeBase64(base64) {
    const binary=atob(base64),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return bytes;
  }
  async function attachPdf(pdf) {
    let input=null;
    for(const label of labelNodes("服务商标签").filter(visible)) {
      for(let parent=label,depth=0;parent&&depth<7;parent=parent.parentElement,depth++) {
        input=deepQueryAll(parent,'input[type="file"]').find(el=>!el.disabled)||null;
        if(input) break;
      }
      if(input) break;
    }
    if(!input) {
      const uploadButtons=deepQueryAll(document,"button,[role=button],label,span,div").filter(el=>visible(el)&&norm(textOf(el)).includes("文件上传")).sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length);
      for(const button of uploadButtons) {
        for(let parent=button,depth=0;parent&&depth<6;parent=parent.parentElement,depth++) {
          input=deepQueryAll(parent,'input[type="file"]').find(el=>!el.disabled)||null;
          if(input) break;
        }
        if(input) break;
      }
    }
    if(!input) return false;
    const file=new File([decodeBase64(pdf.base64)],pdf.name,{type:pdf.type||"application/pdf"});
    const transfer=new DataTransfer(); transfer.items.add(file); input.files=transfer.files;
    input.dispatchEvent(new Event("input",{bubbles:true})); input.dispatchEvent(new Event("change",{bubbles:true})); await wait(250);
    return textOf(document.body).includes(pdf.name)||input.files?.[0]?.name===pdf.name;
  }
  function skuFailure(stage,reason,modal=document.body,details={}) {
    const modalCandidates=deepQueryAll(document,'[role="dialog"],[class*="dialog"],[class*="modal"],[class*="next-overlay"]:not([class*="mask"])').filter(visible);
    const inputs=deepQueryAll(modal,"textarea,input,[role='textbox'],[contenteditable='true']").filter(visible);
    const rows=deepQueryAll(modal,SKU_ROW_SELECTOR).filter(visible);
    const rowCodes=rows.map(row=>textOf(deepQueryAll(row,'td[data-next-table-col="1"],[role="cell"]').find(cell=>visible(cell))||row).replace(/\s+/g," ").trim()).filter(Boolean).slice(0,12);
    let frame="top frame";
    try { if(window!==window.top) frame=`嵌套 frame（name=${window.name||"空"}, frame=${window.frameElement?.id||window.frameElement?.getAttribute("name")||window.frameElement?.getAttribute("class")||"未命名"}）`; }
    catch { frame="跨域嵌套 frame（无法读取 frameElement）"; }
    const inputInfo=inputs.slice(0,8).map(el=>{
      const rect=el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()}${el.id?`#${el.id}`:""}${el.getAttribute("class")?`.${String(el.getAttribute("class")).trim().replace(/\s+/g,".")}`:""}[type=${el.type||""};role=${el.getAttribute("role")||""};placeholder=${el.placeholder||el.getAttribute("data-placeholder")||""};aria=${el.getAttribute("aria-label")||""};editable=${!!el.isContentEditable};visible=${visible(el)};rect=${Math.round(rect.width)}x${Math.round(rect.height)}]`;
    }).join(" | ")||"未检测到可见输入候选";
    const pageText=modal===document.body?"页面主体":String(modal.getAttribute?.("class")||modal.tagName||"未知").slice(0,100);
    const extra=Object.entries(details).map(([key,value])=>`${key}=${value}`).join("；");
    const diagnostic=`页面诊断：扩展脚本=${CONTENT_BUILD}；停止阶段=${stage}；页面=${location.href}；frame=${frame}；弹窗候选=${modalCandidates.length}；当前范围=${pageText}；可见搜索输入候选=${inputs.length}（${inputInfo}）；分页文本=${deepQueryAll(modal,"label,span,div,p").filter(el=>visible(el)&&norm(textOf(el)).includes("每页显示")).slice(0,2).map(textOf).join(" / ")||"未发现"}；可见表格行=${rows.length}；SKU编码样例=${rowCodes.join(", ")||"无"}${extra?`；${extra}`:""}`;
    return {ok:false,message:`${reason}。${diagnostic}`};
  }
  function outboundFailure(stage,reason,completed,pending,details={}) {
    let frame="top frame";
    try { if(window!==window.top) frame=`嵌套 frame（${window.name||window.frameElement?.id||"未命名"}）`; } catch { frame="跨域嵌套 frame"; }
    const page=`页面诊断：扩展脚本=${CONTENT_BUILD}；停止阶段=${stage}；已完成=${completed.join(" → ")||"无"}；未执行=${pending.join("、")||"无"}；页面=${location.href}；frame=${frame}；readyState=${document.readyState}`;
    const extra=Object.entries(details).map(([key,value])=>`${key}=${value}`).join("；");
    return {ok:false,filled:0,attachment:"",misses:[stage],message:`${reason}。${page}${extra?`；${extra}`:""}`};
  }
  async function fillSkuItems(items) {
    if(!items?.length) return skuFailure("04/8.1 准备 SKU 输入","当前订单没有可填写的 SKU 和数量。",document.body,{预期SKU:"无"});
    if(!clickText(["选择SKU信息","选择SKU","添加SKU"])) return skuFailure("04/8.1 打开 SKU 弹窗","没有找到“选择SKU信息”入口。",document.body,{预期SKU:items.map(item=>item.code).join(",")});
    await wait(500);
    let dialogContext=null;
    for(let attempt=0;attempt<15;attempt++) {
      dialogContext=findSkuDialogContext();
      if(dialogContext.found) break;
      if(attempt<14) await wait(200);
    }
    const modal=dialogContext?.modal||document.body;
    const searchCandidates=dialogContext?.inputs||[];
    if(!dialogContext?.found) return skuFailure("04/8.2 定位 SKU 弹窗结构","点击“选择SKU信息”后，没有找到一个可见 dialog/overlay 容器同时包含该标题、搜索框和 SKU 行；未使用底层出库页面字段代替弹窗内容，尚未开始搜索或勾选。",modal,{可见标题候选:dialogContext?.titles?.length||0,可见弹窗候选:deepQueryAll(document,'[role="dialog"],[aria-modal="true"],[class*="dialog"],[class*="modal"],[class*="next-overlay"]:not([class*="mask"])').filter(visible).length,标题所在弹窗摘要:(dialogContext?.stats||[]).slice(0,8).map(item=>`class=${String(item.candidate.getAttribute("class")||"").slice(0,90)},role=${item.candidate.getAttribute("role")||"空"},输入=${item.inputs.length},行=${item.rows.length},文本=${textOf(item.candidate).slice(0,100)}`).join(" || ")||"没有 dialog 候选包含标题",可见输入摘要:searchCandidates.slice(0,8).map(el=>`${el.tagName.toLowerCase()} placeholder=${el.placeholder||el.getAttribute("data-placeholder")||"空"} aria=${el.getAttribute("aria-label")||"空"}`).join(" | ")||"无",SKU行样例:(dialogContext?.rows||[]).slice(0,8).map(textOf).join(" | ")||"无"});
    const search=searchCandidates.find(el=>/sku编码|sku名称|商品编码/i.test(`${el.placeholder||""} ${el.getAttribute("aria-label")||""} ${el.getAttribute("title")||""} ${el.getAttribute("data-placeholder")||""}`))||searchCandidates.find(el=>control(el)||el.getAttribute("role")==="textbox"||el.isContentEditable);
    if(!search) return skuFailure("04/8.2 定位 SKU 搜索框","没有找到 SKU 编码搜索框；当前 frame 中未识别到可见的 textarea/input/role=textbox/contenteditable。",modal,{弹窗候选数:deepQueryAll(document,'[role="dialog"],[class*="dialog"],[class*="modal"],[class*="next-overlay"]:not([class*="mask"])').filter(visible).length,SKU输入候选数:searchCandidates.length,预期SKU:items.map(item=>item.code).join(",")});
    const pageSizeLabel=deepQueryAll(modal,"label,span,div,p").filter(el=>visible(el)&&norm(textOf(el)).includes("每页显示")).sort((a,b)=>textOf(a).length-textOf(b).length)[0];
    if(!pageSizeLabel) return skuFailure("04/8.3 定位分页控件","没有找到“每页显示”标签，未继续 SKU 匹配。",modal,{SKU搜索框:search.tagName.toLowerCase(),搜索框placeholder:search.placeholder||search.getAttribute("data-placeholder")||"空",预期SKU:items.map(item=>item.code).join(",")});
    let sizeTrigger=null;
    for(let parent=pageSizeLabel,depth=0;parent&&depth<5;parent=composedParent(parent),depth++) {
      const controls=deepQueryAll(parent,'select,[role="combobox"],[class*="next-select"],[class*="select"]').filter(visible);
      if(controls.length) { sizeTrigger=controls.at(-1); break; }
    }
    if(!sizeTrigger) return skuFailure("04/8.3 定位每页条数下拉框","找到了分页信息，但没有定位到每页条数下拉框。",modal,{分页标签:textOf(pageSizeLabel),分页父级:textOf(pageSizeLabel.parentElement||pageSizeLabel).slice(0,160)});
    if(sizeTrigger.tagName?.toLowerCase()==="select") {
      const option=[...sizeTrigger.options].find(option=>norm(option.textContent)==="50");
      if(!option) return skuFailure("04/8.3 选择每页 50","原生下拉框中没有 50 选项。",modal,{下拉框标签:sizeTrigger.tagName,已有选项:[...sizeTrigger.options].map(option=>textOf(option)).join(",")});
      sizeTrigger.value=option.value; sizeTrigger.dispatchEvent(new Event("input",{bubbles:true})); sizeTrigger.dispatchEvent(new Event("change",{bubbles:true}));
    } else {
      sizeTrigger.click(); await wait(250);
      const option=visibleExactText("50");
      if(!option) return skuFailure("04/8.3 选择每页 50","已点击每页条数下拉框，但没有找到可见的“50”选项。",modal,{下拉框标签:sizeTrigger.tagName?.toLowerCase(),下拉框class:sizeTrigger.getAttribute("class")||"",分页父级:textOf(pageSizeLabel.parentElement||pageSizeLabel).slice(0,160)});
      option.click();
    }
    await wait(500);
    let pageSizeConfirmed=false;
    for(let parent=pageSizeLabel,depth=0;parent&&depth<5;parent=composedParent(parent),depth++) if(/每页显示.{0,8}50/.test(norm(textOf(parent)))) { pageSizeConfirmed=true; break; }
    if(!pageSizeConfirmed) return skuFailure("04/8.3 确认每页 50","已尝试选择 50，但分页区域文本没有确认切换。",modal,{分页标签:textOf(pageSizeLabel),分页祖先文本:(()=>{let p=pageSizeLabel,t="";for(let i=0;p&&i<5;i++,p=p.parentElement)t+=` ${textOf(p)}`;return t.trim().slice(0,240);})()});
    const searchCodes=[...new Set(items.map(item=>warehouseSkuSearchCode(item.code)).filter(Boolean))];
    if(items.some(item=>!warehouseSkuSearchCode(item.code))) return skuFailure("04/8.4 生成仓库 SKU 查询码","至少一个商品 SKU 归一后为空，未提交搜索。",modal,{原始SKU:items.map(item=>item.code).join("、"),生成查询码:searchCodes.join("、")||"无"});
    const query=searchCodes.join("\n");
    if(search.isContentEditable||search.getAttribute("role")==="textbox") {
      search.textContent=query;
      search.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:query}));
      search.dispatchEvent(new Event("change",{bubbles:true}));
    } else setValue(search,query);
    if(!clickSearchButtonNear(search,modal)) return skuFailure("04/8.4 执行 SKU 搜索","已写入仓库格式查询码，但搜索框附近没有找到搜索按钮。",modal,{输入框描述:`${search.tagName.toLowerCase()} placeholder=${search.placeholder||search.getAttribute("data-placeholder")||"空"}`,原始SKU:items.map(item=>item.code).join("、"),仓库格式查询码:searchCodes.join("、"),查询框实际值:query,搜索图标候选:deepQueryAll(modal,'[class*="search"],button,[role="button"],svg,i').filter(visible).length});
    await wait(1000);
    const selected=[];
    for(const item of items) {
      let matches=deepQueryAll(modal,SKU_ROW_SELECTOR).filter(row=>visible(row)&&rowMatchesSku(row,item.code));
      if(!matches.length) {
        const skuKey=normalizeSku(item.code);
        matches=deepQueryAll(modal,SKU_ROW_SELECTOR).filter(row=>visible(row)&&deepQueryAll(row,'td[data-next-table-col="1"],[role="cell"]').some(cell=>normalizeSku(textOf(cell))===skuKey));
      }
      // DOM 有时会同时命中同一行的 next-table-row 和内部 role=row 包装；只保留最内层行。
      const distinctMatches=matches.filter(row=>!matches.some(other=>other!==row&&row.contains?.(other)));
      if(distinctMatches.length>1) return skuFailure("04/8.5 校验 SKU 匹配唯一性",`SKU ${item.code} 在当前弹窗中匹配到 ${distinctMatches.length} 个独立行；为避免选错，已停止。`,modal,{目标SKU:item.code,匹配行摘要:distinctMatches.slice(0,8).map(textOf).join(" | ")});
      const row=distinctMatches.sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0];
      if(!row) return skuFailure("04/8.5 从弹窗表格匹配 SKU",`没有匹配到 ${item.code}（按忽略 AE- 前缀及标点匹配）；已匹配=${selected.join("、")||"无"}`,modal,{目标SKU:item.code,当前页行数:deepQueryAll(modal,SKU_ROW_SELECTOR).filter(visible).length,表格SKU样例:deepQueryAll(modal,SKU_ROW_SELECTOR).filter(visible).slice(0,20).map(row=>textOf(deepQueryAll(row,'td[data-next-table-col="1"],[role="cell"]').find(cell=>visible(cell))||row).replace(/\s+/g," ").trim()).join(" | ")||"无"});
      if(!clickCheckboxInRow(row)) return skuFailure("04/8.6 勾选匹配 SKU",`匹配到 ${item.code}，但该行没有可见复选框。`,modal,{匹配行文本:textOf(row).slice(0,180)});
      await wait(120);
      const nativeCheck=deepQueryAll(row,'input[type="checkbox"]').at(-1);
      const accessibleCheck=deepQueryAll(row,'[role="checkbox"],[class*="next-checkbox-wrapper"]').find(el=>visible(el));
      const checked=nativeCheck?nativeCheck.checked===true:accessibleCheck?.getAttribute("aria-checked")==="true"||/checked|selected/i.test(String(accessibleCheck?.className||""));
      if(!checked) return skuFailure("04/8.6 确认 SKU 勾选状态",`匹配到 ${item.code}，已触发复选框点击，但 DOM 状态仍未确认选中。`,modal,{匹配行文本:textOf(row).slice(0,180),原生checkbox数:deepQueryAll(row,'input[type="checkbox"]').length,原生checkboxChecked:nativeCheck?String(nativeCheck.checked):"无",ariaChecked:accessibleCheck?.getAttribute("aria-checked")||"无",checkboxClass:accessibleCheck?.getAttribute("class")||"无"});
      selected.push(item.code);
    }
    const confirm=visibleExactTextWithin(modal,"确定")||visibleExactTextWithin(modal,"确认");
    if(!confirm) return skuFailure("04/8.7 确认 SKU 选择","SKU 已勾选，但弹窗中没有找到“确定”按钮。",modal,{已勾选SKU:selected.join(","),按钮候选:deepQueryAll(modal,"button,[role=button]").filter(visible).map(textOf).filter(Boolean).slice(-12).join(" | ")||"无"});
    confirm.click(); await wait(650);
    for(const item of items) {
      const matchingRows=deepQueryAll(document,SKU_ROW_SELECTOR).filter(row=>visible(row)&&rowMatchesSku(row,item.code));
      const rowsWithQuantityControl=matchingRows.filter(candidate=>deepQueryAll(candidate,"input").some(input=>/^(?:qty|quantity)[_-]/i.test(input.id)));
      const rows=rowsWithQuantityControl.length?rowsWithQuantityControl:matchingRows;
      const row=rows.sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0];
      if(!row) return skuFailure("04/8.8 确认后回查 SKU 主表",`弹窗确认后主表没有找到已添加的 SKU ${item.code}，未继续物流设置。`,document.body,{已确认SKU:selected.join(","),主表SKU行数:deepQueryAll(document,SKU_ROW_SELECTOR).filter(visible).length});
      const quantityInputs=deepQueryAll(row,"input").filter(el=>control(el)&&!el.disabled&&!el.readOnly);
      const byId=quantityInputs.filter(el=>/^(?:qty|quantity)[_-]/i.test(el.id));
      const byName=quantityInputs.filter(el=>/qty|quantity/i.test(`${el.name||""} ${el.getAttribute("data-testid")||""}`));
      const byLabel=quantityInputs.filter(el=>/数量|quantity|件数/i.test(`${el.placeholder||""} ${el.getAttribute("aria-label")||""} ${el.getAttribute("name")||""}`));
      const numeric=quantityInputs.filter(el=>el.type==="number");
      const pool=byId.length?byId:byName.length?byName:byLabel.length?byLabel:numeric;
      const quantity=pool.length===1?pool[0]:null;
      const quantitySummary=quantityInputs.map(el=>`id=${el.id||"空"},name=${el.name||"空"},type=${el.type||"text"},placeholder=${el.placeholder||"空"},value=${el.value||"空"},readonly=${el.readOnly},disabled=${el.disabled}`).join(" | ")||"无可用输入框";
      if(!quantity) return skuFailure("04/8.8 定位 SKU 数量输入框",`SKU ${item.code} 已加入主表，但无法唯一确认数量输入框；为避免把数量写到 SKU 编码、平台 ItemId 或库存质量字段，已停止物流和 PDF。`,document.body,{匹配主表行:textOf(row).slice(0,220),数量候选数:quantityInputs.length,按控件ID候选:byId.length,按名称候选:byName.length,按标签候选:byLabel.length,数字输入候选:numeric.length,输入框明细:quantitySummary});
      setValue(quantity,item.quantity);
      await wait(180);
      const expected=String(item.quantity).trim();
      const actual=String(quantity.value||"").trim();
      if(!actual||!Number.isFinite(Number(actual))||Number(actual)!==Number(expected)) return skuFailure("04/8.8 回读确认 SKU 数量",`SKU ${item.code} 的数量框写入后回读不一致：目标=${expected}，实际=${actual||"空"}；已停止物流和 PDF。`,document.body,{数量输入框ID:quantity.id||"无",输入框类型:quantity.type||"text",输入框值:actual||"空",readonly:quantity.readOnly,disabled:quantity.disabled,匹配主表行:textOf(row).slice(0,220),同行输入框明细:quantitySummary});
    }
    return {ok:true,message:`SKU 已匹配、勾选并填写数量：${items.map(item=>`${item.code}×${item.quantity}`).join("，")}`};
  }
  function clickRadioLabel(label) {
    const target=norm(label);
    const textNode=deepQueryAll(document,"label,span,div,p").filter(el=>visible(el)&&norm(textOf(el))===target).sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0];
    if(!textNode) return false;
    for(let parent=textNode,depth=0;parent&&depth<5;parent=parent.parentElement,depth++) {
      const radios=deepQueryAll(parent,'input[type="radio"],[role="radio"],[class*="next-radio"]').filter(visible);
      if(radios.length===1) { (radios[0].closest("label")||radios[0]).click(); return true; }
      if(parent.tagName?.toLowerCase()==="label") { parent.click(); return true; }
    }
    textNode.click(); return true;
  }
  function serviceKey(value) { return norm(value).replace(/[-—_]/g,""); }
  function findServiceOption(serviceName) {
    const key=serviceKey(serviceName);
    return deepQueryAll(document,'tr,[role="row"],[class*="next-table-row"],label,li,span,div').filter(el=>visible(el)&&serviceKey(textOf(el))===key).sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0]||null;
  }
  function findServiceRadio(option) {
    for(let parent=option,depth=0;parent&&depth<7;parent=composedParent(parent),depth++) {
      const native=deepQueryAll(parent,'input[type="radio"]');
      if(native.length===1) return native[0];
      const accessible=deepQueryAll(parent,'[role="radio"]');
      if(accessible.length===1) return accessible[0];
      const custom=deepQueryAll(parent,'[class*="next-radio-wrapper"],[class*="next-radio"]')
        .filter(el=>visible(el)&&!el.querySelector('[class*="next-radio"]'));
      if(custom.length===1) return custom[0];
    }
    return null;
  }
  function serviceRadioState(radio) {
    if(!radio) return null;
    if(radio.matches?.('input[type="radio"]')) return radio.checked===true;
    const aria=radio.getAttribute("aria-checked");
    if(aria==="true") return true;
    if(aria==="false") return false;
    return /(?:^|[-_\s])(checked|selected|active)(?:$|[-_\s])|is-checked|is-selected/i.test(String(radio.className||""));
  }
  function clickServiceOption(option) {
    const radio=findServiceRadio(option);
    if(radio&&serviceRadioState(radio)===true) return radio;
    if(radio) {
      const target=radio.matches?.('input[type="radio"]')
        ?radio.closest("label")||radio.closest('[class*="next-radio-wrapper"]')||radio.parentElement
        :radio;
      (target&&visible(target)?target:option).click();
      return radio;
    }
    option.click();
    return null;
  }
  async function selectLogisticsService(serviceName) {
    const waitForOption=async(timeout=5000)=>{
      const start=Date.now();
      let option=null;
      while(Date.now()-start<timeout) {
        option=findServiceOption(serviceName);
        if(option) return {option,waited:Date.now()-start};
        await wait(200);
      }
      return {option:null,waited:Date.now()-start};
    };
    let searchUsed=false;
    let searchWait=await waitForOption(5000);
    let option=searchWait.option;
    const search=deepQueryAll(document,"input,textarea").find(el=>control(el)&&/物流服务名称/.test(`${el.placeholder} ${el.getAttribute("aria-label")||""}`));
    if(!option&&search) {
      searchUsed=true;
      setValue(search,serviceName);
      if(!clickSearchButtonNear(search,document)) clickText(["搜索"]);
      searchWait=await waitForOption(5000);
      option=searchWait.option;
    }
    if(!option) return {ok:false,reason:"结果超时",waited:searchWait.waited,searchUsed,option:null,radioState:null,trackingInput:null};
    const radio=clickServiceOption(option);
    const started=Date.now();
    let trackingInput=null,radioState=serviceRadioState(radio);
    while(Date.now()-started<5000) {
      radioState=serviceRadioState(radio);
      trackingInput=findLabeledControl("物流单号")||findLabeledControl("运单号");
      // 菜鸟只有在物流服务生效后才显示运单输入框；它可作为单选状态的第二重确认。
      if(trackingInput) return {ok:true,option,waited:Date.now()-started,searchWait:searchWait.waited,searchUsed,radioState,trackingInput};
      await wait(200);
    }
    return {ok:false,reason:radioState===true?"物流单号输入框超时":"物流服务单选项未确认选中",option,waited:Date.now()-started,searchWait:searchWait.waited,searchUsed,radioState,trackingInput};
  }
  async function prepareOutbound(payload) {
    const addressMisses=[];
    const completed=[];
    const pendingAfterBasics=["客户订单号/销售平台/平台订单号","收件人信息","SKU 弹窗/匹配/勾选/数量","快递与物流服务","物流单号","PDF 上传"];
    if(!await selectByLabel("出货仓库",payload.warehouse)) return outboundFailure("01/8 选择出货仓库",`未能选择“${payload.warehouse}”，已停止本单。请检查出货仓库下拉框是否打开、选项是否可见。`,completed,pendingAfterBasics,{目标仓库:payload.warehouse,可见输入数:deepQueryAll(document,"input,textarea").filter(visible).length,页面文本含目标仓库:textOf(document.body).includes(payload.warehouse)});
    completed.push(`出货仓库=${payload.warehouse}`);
    const customerOrderFilled=fillLabel("客户订单号",payload.orderId);
    const platformSelected=await selectByLabel("销售平台",payload.platform);
    const platformOrderFilled=fillLabel("平台订单号",payload.orderId);
    if(!customerOrderFilled||!platformSelected||!platformOrderFilled) {
      const missing=[!customerOrderFilled?"客户订单号":null,!platformSelected?"销售平台":null,!platformOrderFilled?"平台订单号":null].filter(Boolean);
      return outboundFailure("02/8 填写基本信息",`基本信息未填完整：${missing.join("、")}；两个订单号目标值均为 ${payload.orderId}。`,completed,["收件人信息","SKU 弹窗/匹配/勾选/数量","快递与物流服务","物流单号","PDF 上传"],{客户订单号已确认:customerOrderFilled,销售平台已确认:platformSelected,平台订单号已确认:platformOrderFilled,当前可见输入框摘要:deepQueryAll(document,"input").filter(visible).slice(0,16).map(el=>`${el.type||el.tagName.toLowerCase()} placeholder=${el.placeholder||"无"} aria=${el.getAttribute("aria-label")||"无"} valuePresent=${!!el.value}`).join(" | ")||"无"});
    }
    completed.push(`客户订单号=${payload.orderId}`,`销售平台=${payload.platform}`,`平台订单号=${payload.orderId}`);
    const addressFields=[
      ["姓名","name",true],["电话","phone",true],["邮编","postalCode",true],["国家","country",true],
      ["省/州","state",true],["市","city",true],["所在区/县","district",false],["街道","street",true],["公司","company",false],["邮箱","email",false]
    ];
    let addressFilled=0;
    for(const [label,key,required] of addressFields) {
      const value=payload.address?.[key]; if(!value) continue;
      if(fillLabel(label,value)) addressFilled++; else if(required) addressMisses.push(`收件人${label}`);
    }
    if(addressFilled<5) addressMisses.push("收件人信息字段不足");
    completed.push(`收件人信息已写入 ${addressFilled} 个字段`);
    const sku=await fillSkuItems(payload.skuItems||[]);
    if(!sku.ok) return {...sku,filled:addressFilled,attachment:"",misses:[...addressMisses,...(sku.misses||[sku.message])],message:`${sku.message}\n流程上下文：已完成=${completed.join(" → ")}；停止于 SKU 阶段；未执行=快递/物流服务、物流单号、PDF 上传。`};
    completed.push(sku.message);
    if(!clickRadioLabel("快递")) return {...outboundFailure("05/8 选择运输方式",`SKU 已完成，但未找到或未能选择“快递”单选项。`,completed,["物流服务","物流单号","PDF 上传"],{可见快递文本候选:deepQueryAll(document,"label,span,div").filter(el=>visible(el)&&norm(textOf(el))==="快递").length}),filled:addressFilled};
    completed.push("运输方式=快递");
    const carrierName=payload.carrier==="DPD"?"出库自提-波兰DPD":"出库自提-波兰Inpost";
    const serviceResult=await selectLogisticsService(carrierName);
    if(!serviceResult.ok) {
      const visibleServiceRows=deepQueryAll(document,'tr,[role="row"],[class*="next-table-row"],label,li,span,div').filter(el=>visible(el)&&/出库自提|DPD|Inpost/i.test(textOf(el))).slice(0,12).map(el=>`${textOf(el).slice(0,140)} [radio=${serviceRadioState(findServiceRadio(el))}]`).join(" | ")||"无";
      const nextStep=serviceResult.reason==="结果超时"?"等待物流搜索结果":"确认物流服务选中并等待运单输入框";
      return {...outboundFailure(`06/8.${serviceResult.reason==="结果超时"?"1":"2"} ${nextStep}`,serviceResult.reason==="结果超时"?`等待 ${serviceResult.waited}ms 后仍未找到物流服务“${carrierName}”。`:serviceResult.reason==="物流服务单选项未确认选中"?`找到物流服务“${carrierName}”，但点击后未确认单选状态；等待 ${serviceResult.waited}ms 仍未出现运单输入框。`:`物流服务已确认，但等待 ${serviceResult.waited}ms 后仍未出现运单号输入框。`,completed,["物流单号","PDF 上传"],{目标服务:carrierName,结果搜索是否执行:serviceResult.searchUsed,等待搜索结果毫秒:serviceResult.searchWait,点击后等待毫秒:serviceResult.waited,目标服务单选状态:serviceResult.radioState===null?"无法识别":String(serviceResult.radioState),运单输入框是否出现:!!serviceResult.trackingInput,可见服务候选:visibleServiceRows,可见输入摘要:deepQueryAll(document,"input,textarea").filter(visible).slice(-12).map(el=>`${el.tagName.toLowerCase()} id=${el.id||"空"} type=${el.type||""} placeholder=${el.placeholder||"无"} value=${el.value||"空"}`).join(" | ")||"无"}),filled:addressFilled};
    }
    completed.push(`物流服务=${carrierName}`);
    const trackingInput=serviceResult.trackingInput;
    setValue(trackingInput,payload.tracking);
    await wait(180);
    if(String(trackingInput.value||"").trim()!==String(payload.tracking||"").trim()) return {...outboundFailure("07/8 回读确认物流单号",`已选中 ${carrierName} 并出现物流单号输入框，但写入后回读不一致：目标=${payload.tracking}，实际=${trackingInput.value||"空"}。`,completed,["PDF 上传"],{物流单号输入框ID:trackingInput.id||"无",输入框类型:trackingInput.type||"text",placeholder:trackingInput.placeholder||"无",readonly:trackingInput.readOnly,disabled:trackingInput.disabled}),filled:addressFilled};
    completed.push(`物流单号=${payload.tracking}`);
    let attachment="";
    const uploadMisses=[];
    try { if(await attachPdf(payload.pdf)) attachment=payload.pdf.name; else uploadMisses.push("服务商标签 PDF"); }
    catch(e){uploadMisses.push(`服务商标签 PDF：${e.message}`);}
    if(uploadMisses.length) return {...outboundFailure("08/8 上传订单 PDF",`SKU、物流服务和运单号均已完成，但服务商标签 PDF 上传失败：${uploadMisses.join("、")}`,completed,["确认文件显示成功；用户核对并手动创建"],{目标文件:payload.pdf?.name||"无",文件控件数量:deepQueryAll(document,'input[type="file"]').length,可见上传按钮:deepQueryAll(document,"button,[role=button],label,span,div").filter(el=>visible(el)&&/文件上传/.test(textOf(el))).length}),filled:addressFilled,attachment,misses:[...addressMisses,...uploadMisses]};
    const addressNote=addressMisses.length?`；请检查收件人字段：${addressMisses.join("、")}`:"";
    return {ok:addressMisses.length===0,filled:addressFilled,attachment,misses:addressMisses,message:`v${CONTENT_BUILD} 预填流程完成：${completed.join(" → ")} → 服务商标签文件=${attachment}。${addressNote}请核对字段后手动点击创建。`};
  }

  function extractNextTableSkuRows(table) {
    const result=[];
    let rows=deepQueryAll(table,'tbody tr:not(.next-table-group-header)');
    if(!rows.length) rows=[table];
    for(const row of rows) {
      const productCell=deepQueryAll(row,'td[data-next-table-col="1"]')[0]||(deepQueryAll(row,'[class*="PackageTable--media--"]').length?row:null);
      const countCell=deepQueryAll(row,'td[data-next-table-col="2"]')[0];
      const quantityCell=countCell||(deepQueryAll(row,'[class*="PackageTable--count"]').length?row:null);
      if(!productCell) continue;
      let products=deepQueryAll(productCell,'[class*="PackageTable--media--"]');
      if(!products.length) products=[productCell];
      const quantities=(quantityCell?deepQueryAll(quantityCell,'[class*="PackageTable--count"]'):[]).map(el=>{
        const match=textOf(el).match(/x\s*(\d+)/i); return match?Number(match[1]):null;
      });
      products.forEach((product,index)=>{
        const match=deepTextOf(product).match(/商品编码\s*[:：]\s*([A-Za-z0-9._-]+)/i);
        if(match) result.push(`${match[1].replace(/^AE-/i,"")},${quantities[index]||""}`);
      });
    }
    return result.join("\n");
  }
  function extractTableField(text, label) {
    const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    return text.match(new RegExp(`${escaped}\\s*[:：]\\s*([^\\s]+)`,"i"))?.[1]?.trim()||"";
  }
  function extractLabelValue(lines,pattern) {
    const i=lines.findIndex(line=>pattern.test(line)); if(i<0)return "";
    const same=lines[i].replace(pattern,"").replace(/^\s*[:：-]?\s*/,"").trim();
    if(same) return same;
    return lines.slice(i+1,i+3).find(line=>line&&!/^(订单|商品|买家|收件|物流|地址|数量)/.test(line))||"";
  }
  function extractNextTableOrder(table) {
    const orderId=extractOrderId(deepTextOf(table));
    let rows=deepQueryAll(table,'tbody tr:not(.next-table-group-header)');
    if(!rows.length) rows=[table];
    const logisticsCell=rows.map(candidate=>deepQueryAll(candidate,'td[data-next-table-col="3"]')[0]).find(Boolean)||deepQueryAll(table,'*').find(element=>textOf(element).includes("首公里服务商"));
    const logisticsText=deepTextOf(logisticsCell)||"";
    const buyerCell=rows.map(candidate=>deepQueryAll(candidate,'td[data-next-table-col="4"]')[0]).find(Boolean)||deepQueryAll(table,'*').find(element=>norm(textOf(element))==="复制买家信息")?.parentElement;
    const buyerName=deepTextOf(deepQueryAll(buyerCell,'[class*="PackageTable--seller-name-text"]')[0]);
    const firstMileProvider=extractTableField(logisticsText,"首公里服务商");
    const deliveryProvider=extractTableField(logisticsText,"配送商");
    const carrier=/in\s*post/i.test(firstMileProvider)?"Inpost":/\bDPD\b/i.test(firstMileProvider)?"DPD":"";
    const tracking=extractTableField(logisticsText,"运单号");
    const skuRows=extractNextTableSkuRows(table);
    return {orderId,buyerName,buyerRaw:"",skuRows,carrier,firstMileProvider,deliveryProvider,tracking,hasCopyAddress:!!buyerCell&&deepTextOf(buyerCell).includes("复制买家信息")};
  }
  function extractOrderId(text) {
    return String(text||"").replace(/[\s\u200b\ufeff]+/g,"").match(/订单号[:：]?(\d{10,})/)?.[1]||"";
  }
  function findOrderContainerByText(orderId) {
    const roots=[document,...deepQueryAll(document,"*").map(element=>element.shadowRoot).filter(Boolean)];
    let textFound=false;
    let best=null;
    let bestScore=0;
    for(const root of roots) {
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      let textNode;
      while((textNode=walker.nextNode())) {
        if(!String(textNode.nodeValue||"").replace(/[\s\u200b\ufeff]/g,"").includes(orderId)) continue;
        textFound=true;
        let element=textNode.parentElement;
        while(element) {
          const content=deepTextOf(element).replace(/[\s\u200b\ufeff]/g,"");
          if(content.includes(orderId)) {
            const hasProduct=content.includes("商品编码");
            const hasBuyer=content.includes("复制买家信息");
            const hasTracking=content.includes("运单号");
            const hasProvider=content.includes("首公里服务商")||content.includes("配送商");
            const score=Number(hasProduct)+Number(hasBuyer)+Number(hasTracking)+Number(hasProvider);
            const isTable=element.tagName?.toLowerCase()==="table"||element.matches?.("[role='row'],[class*='next-table-row']");
            if(score>bestScore||(score===bestScore&&isTable&&!best?.isTable)) {
              best={element,isTable};
              bestScore=score;
            }
            if(score===4&&isTable) return {element,textFound};
          }
          element=element.parentElement||element.getRootNode?.().host||null;
        }
      }
    }
    return {element:bestScore>=3?best?.element||null:null,textFound};
  }
  function findBuyerCopyButton(table) {
    const buyerCell=deepQueryAll(table,'tbody tr:not(.next-table-group-header) td[data-next-table-col="4"]')[0]||table;
    return deepQueryAll(buyerCell,"button,[role=button],a,span,div").filter(el=>visible(el)&&norm(textOf(el))==="复制买家信息").sort((a,b)=>a.querySelectorAll("*").length-b.querySelectorAll("*").length)[0]||null;
  }
  function focusBuyerCopyButton(table) {
    const button=findBuyerCopyButton(table);
    if(!button) return {ok:false,message:"该订单行没有找到“复制买家信息”按钮。"};
    button.scrollIntoView({behavior:"smooth",block:"center",inline:"center"});
    const outline=button.style.outline,offset=button.style.outlineOffset;
    button.style.outline="3px solid #315efb"; button.style.outlineOffset="3px";
    setTimeout(()=>{button.style.outline=outline;button.style.outlineOffset=offset;},15000);
    button.click();
    return {ok:true,message:"已定位并尝试自动点击“复制买家信息”。请回侧边栏点“读取剪贴板”；若剪贴板为空，请在 CSP 页面真实点击仍高亮的按钮后再读取。脚本点击不一定会被 CSP 当作真实用户操作。"};
  }
  async function focusCspBuyerCopy(orderId) {
    const located=await locateCspOrder(orderId);
    if(!located.table) return {ok:false,message:`当前 CSP 页面未找到订单 ${orderId}，无法定位买家信息按钮。`};
    const result=focusBuyerCopyButton(located.table);
    if(result.ok) await wait(350);
    return result;
  }
  function findOrderSearchInput() {
    for(const node of labelNodes("订单号")) {
      for(let parent=node,depth=0;parent&&depth<5;parent=parent.parentElement,depth++) {
        const input=[...parent.querySelectorAll("input")].find(control);
        if(input) return input;
      }
    }
    return [...document.querySelectorAll("input")].find(el=>control(el)&&/订单|order|搜索/i.test(`${el.placeholder} ${el.getAttribute("aria-label")||""} ${el.name||""}`))||null;
  }
  async function locateCspOrder(orderId) {
    const find=()=>{
      const candidate=deepQueryAll(document,"[class*='next-table-row']").find(element=>extractOrderId(deepTextOf(element))===orderId);
      if(candidate) return {table:candidate,textFound:true};
      const textMatch=findOrderContainerByText(orderId);
      return {table:textMatch.element,textFound:textMatch.textFound};
    };
    let found=find();
    let table=found.table;
    let textFound=found.textFound;
    if(table) return {table,textFound:true};
    const search=findOrderSearchInput();
    if(!search) return {table:null,textFound};
    setValue(search,orderId);
    if(!clickText(["搜索"])) {
      search.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
      search.dispatchEvent(new KeyboardEvent("keyup",{key:"Enter",bubbles:true}));
    }
    await wait(1000);
    found=find();
    table=found.table;
    textFound=textFound||found.textFound;
    return {table:table||null,textFound};
  }
  async function captureVisibleCsp() {
    const orders=[...document.querySelectorAll("[class*='next-table-row']")]
      .filter(table=>{const r=table.getBoundingClientRect(),s=getComputedStyle(table);return r.width>0&&r.height>0&&s.visibility!=="hidden"&&s.display!=="none";})
      .map(extractNextTableOrder).filter(order=>order.orderId);
    if(!orders.length) return {ok:false,message:"当前 CSP 页面没有找到可见的订单 table 行。请打开待揽收列表并确认订单行已加载。"};
    return {ok:true,data:{orders},message:`已读取当前页面可见的 ${orders.length} 个订单行。`};
  }
  async function captureCsp(orderId) {
    const located=await locateCspOrder(orderId);
    const table=located.table;
    if(!table) {
      const blockCount=document.querySelectorAll("[class*='next-table-row']").length;
      const hasSearch=!!findOrderSearchInput();
      const textHint=located.textFound?"本 frame 的页面文本中存在该订单号，但表格结构未匹配。":"本 frame 的页面文本中也没有该订单号。";
      return {ok:false,message:`当前 CSP 内容区未找到订单 ${orderId}。${textHint}检测到 ${blockCount} 个 next-table-row 块${hasSearch?"，并已尝试订单号搜索":"，且未发现订单号搜索框"}。请确认页面停留在“运输中/待揽收”列表。`};
    }
    const data=extractNextTableOrder(table);
    data.buyerRaw="";
    const hasCopyButton=!!findBuyerCopyButton(table);
    return {ok:true,message:`已定位订单 ${orderId}：${data.skuRows?"SKU/数量已读取":"未识别商品行"}；首公里服务商 ${data.firstMileProvider||"未识别"}；运单号 ${data.tracking||"未识别"}；买家 ${data.buyerName||"未识别"}。${hasCopyButton?'可点“自动点击复制按钮”尝试复制，再读取剪贴板；若剪贴板为空，请在 CSP 页面真实点击该按钮后重读。':'该订单行没有找到“复制买家信息”按钮。'}`,data};
  }
  async function captureCspOrders(orderIds) {
    const results=[];
    for(const orderId of [...new Set((orderIds||[]).map(String).filter(Boolean))]) {
      try { results.push({orderId,...await captureCsp(orderId)}); }
      catch(error) { results.push({orderId,ok:false,message:error.message||"读取该订单失败。"}); }
    }
    return {ok:true,data:{results},message:`已按顺序处理 ${results.length} 个订单。`};
  }
  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type==="CAINIAO_PREPARE_OUTBOUND") { prepareOutbound(message.payload||{}).then(sendResponse).catch(e=>sendResponse({ok:false,message:e.message||"页面填写失败。"})); return true; }
    if(message?.type==="CSP_CAPTURE_ORDER") { captureCsp(message.orderId).then(sendResponse).catch(e=>sendResponse({ok:false,message:e.message||"读取失败。"})); return true; }
    if(message?.type==="CSP_FOCUS_BUYER_COPY") { focusCspBuyerCopy(message.orderId).then(sendResponse).catch(e=>sendResponse({ok:false,message:e.message||"定位复制按钮失败。"})); return true; }
    if(message?.type==="CSP_CAPTURE_VISIBLE_ORDERS") { captureVisibleCsp().then(sendResponse).catch(e=>sendResponse({ok:false,message:e.message||"批量读取失败。"})); return true; }
    if(message?.type==="CSP_CAPTURE_ORDERS") { captureCspOrders(message.orderIds).then(sendResponse).catch(e=>sendResponse({ok:false,message:e.message||"批量读取失败。"})); return true; }
    return false;
  });
})();
