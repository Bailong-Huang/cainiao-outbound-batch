(() => {
  const countryCodes = new Set("AT BE BG CH CZ DE DK EE ES FI FR GB GR HR HU IE LT LU LV NL NO PL PT RO SE SI SK".split(" "));
  const countryNames = {
    AT:["Austria"], BE:["Belgium"], BG:["Bulgaria"], CH:["Switzerland"], CZ:["Czechia","Czech Republic"],
    DE:["Germany"], DK:["Denmark"], EE:["Estonia","Eesti"], ES:["Spain"], FI:["Finland"], FR:["France"],
    GB:["United Kingdom","Great Britain"], GR:["Greece"], HR:["Croatia"], HU:["Hungary"], IE:["Ireland"],
    LT:["Lithuania"], LU:["Luxembourg"], LV:["Latvia"], NL:["Netherlands"], NO:["Norway"], PL:["Poland","Polska"],
    PT:["Portugal"], RO:["Romania"], SE:["Sweden"], SI:["Slovenia"], SK:["Slovakia"]
  };
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().replace(/^[,;\s]+|[,;\s]+$/g, "");
  const fold = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const isPhone = (line) => /^\+?\d[\d\s().-]{6,}$/.test(clean(line)) && /(?:^\+|\d{7,})/.test(clean(line).replace(/\s/g, ""));
  const isPostal = (line) => /^(?:[A-Z]{1,2}[-\s]?)?\d[\dA-Z -]{2,9}$/i.test(clean(line)) && !isPhone(clean(line));
  const countryFromCode = (value) => countryCodes.has(clean(value).toUpperCase()) ? clean(value).toUpperCase() : "";
  function escapeRegex(value) { return String(value).replace(/[.*+?^{}()|[\]\\]/g, "\\$&").replace(/\$/g, "\\$"); }
  function countryFromText(value) {
    const text=String(value||"");
    for(const [code,names] of Object.entries(countryNames)) {
      if(names.some(name=>new RegExp("(^|[^A-Za-z])"+escapeRegex(name)+"([^A-Za-z]|$)","i").test(text))) return code;
    }
    return "";
  }
  function countryPattern(code) {
    const names=countryNames[code]||[];
    return new RegExp("(^|[^A-Za-z])(?:"+[code,...names].map(escapeRegex).join("|")+")(?=$|[^A-Za-z])","gi");
  }
  function editDistance(a,b) {
    const row=Array.from({length:b.length+1},(_,index)=>index);
    for(let i=1;i<=a.length;i++) {
      let diagonal=row[0]; row[0]=i;
      for(let j=1;j<=b.length;j++) {
        const old=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1)); diagonal=old;
      }
    }
    return row[b.length];
  }
  function similarLocality(a,b) {
    const left=fold(a),right=fold(b);
    if(!left||!right) return false;
    if(left===right) return true;
    if(Math.min(left.length,right.length)<7) return false;
    return 1-editDistance(left,right)/Math.max(left.length,right.length)>=0.8;
  }
  function cleanSegment(segment,code,postalCodes) {
    let value=clean(segment);
    if(code) value=value.replace(countryPattern(code)," ");
    for(const postal of postalCodes) if(postal) value=value.replace(new RegExp("\\b"+escapeRegex(postal)+"\\b","gi")," ");
    value=value.replace(/\b\d{5}\b/g,(match)=>{postalCodes.add(match);return " ";});
    return clean(value.replace(/\s{2,}/g," ").replace(/^[,;\s]+|[,;\s]+$/g,""));
  }
  function parseBuyerAddress(raw, fallbackName = "") {
    const rawLines = String(raw || "").split(/\r?\n/).map(clean).filter(Boolean);
    if (!rawLines.length) throw new Error("买家地址为空，请粘贴 CSP 的完整买家信息。");
    const firstLineIsName = !(/^\+?\d/.test(rawLines[0]) || /^[A-Z]{2}\s*[,;]/i.test(rawLines[0]));
    const name = firstLineIsName ? rawLines[0] : clean(fallbackName);
    const lines = firstLineIsName ? rawLines.slice(1) : rawLines;
    if (!name) throw new Error("没有识别到收件人姓名；剪贴板首行是地址内容，且 CSP 未提供姓名。");
    if (lines.length < 2) throw new Error("姓名之后没有足够的地址内容，请检查买家信息是否完整。");

    const phoneIndex = lines.findLastIndex(isPhone);
    if (phoneIndex < 0) throw new Error("没有识别到电话号码。");
    const phone = lines[phoneIndex];
    let postalCode = "";
    const addressLines=lines.slice(0,phoneIndex);
    for(const line of addressLines) if(!postalCode&&isPostal(line)&&!line.includes(",")) postalCode=line;
    if(!postalCode) postalCode=addressLines.join(" ").match(/\b\d{5}\b/)?.[0]||"";

    const rawAddress=addressLines.join(",");
    const rawParts=rawAddress.split(",").map(clean).filter(Boolean);
    const firstCode=countryFromCode(rawParts[0]);
    const country=firstCode||countryFromText(rawAddress)||rawParts.map(countryFromCode).find(Boolean)||"";
    const postalCodes=new Set(postalCode?[postalCode]:[]);
    let parts=rawParts.map(segment=>cleanSegment(segment,country,postalCodes)).filter(Boolean);
    postalCode ||= [...postalCodes][0]||"";
    const warnings=[];
    const initialCount=rawParts.length;
    let state="",city="",district="",street="",needsReview=false;

    if(firstCode) {
      // 国家代码开头按“国家代码、省/州、城市、街道”解析；其余重复地区及邮编视为噪声。
      parts=parts.filter((part,index)=>!(index===0&&countryFromCode(part)));
      state=parts[0]||"";
      city=parts[1]||"";
      const localities=[state,city].filter(Boolean);
      const tail=[];
      for(const part of parts.slice(2)) {
        if(localities.some(locality=>similarLocality(part,locality))) { warnings.push("已清理重复地区“"+part+"”"); continue; }
        if(tail.some(existing=>fold(existing)===fold(part))) { warnings.push("已清理重复地址片段“"+part+"”"); continue; }
        tail.push(part);
      }
      street=tail.join(", ");
      if(!state||!city||!street||tail.length!==1) needsReview=true;
    } else {
      const lastCountryIndex=rawParts.findLastIndex(part=>countryFromCode(part)||countryFromText(part));
      if(lastCountryIndex>=0) {
        const before=rawParts.slice(0,lastCountryIndex).map(segment=>cleanSegment(segment,country,postalCodes)).filter(Boolean);
        const after=rawParts.slice(lastCountryIndex+1).map(segment=>cleanSegment(segment,country,postalCodes)).filter(Boolean);
        const unique=[];
        for(const part of [...before,...after]) if(!unique.some(existing=>fold(existing)===fold(part))) unique.push(part); else warnings.push("已清理重复地址片段“"+part+"”");
        const streetWords=/\b(?:rue|street|strasse|straße|str\.|road|avenue|ave\.|via|calle|camino|ul\.|ulica|aleja|tee|lane|route|chemin|carrer|plac)\b/i;
        const houseNumber=/\p{L}[\p{L}'’.-]*(?:\s+\p{L}[\p{L}'’.-]*){0,4}\s+\d+[A-Za-z]?(?:\b|$)/u;
        const streetCandidates=unique.map((part,index)=>({part,index,score:(streetWords.test(part)?2:0)+(houseNumber.test(part)?2:0)})).filter(item=>item.score>=2);
        if(unique.length>=3&&streetCandidates.length===1) {
          const streetIndex=streetCandidates[0].index;
          if(streetIndex===0) {
            street=unique[0]; city=unique[1]||""; state=unique[2]||""; district=unique.slice(3).join(", ");
          } else if(streetIndex===unique.length-1) {
            street=unique[streetIndex]; city=unique[streetIndex-1]||""; state=unique[streetIndex-2]||""; district=unique.slice(0,Math.max(0,streetIndex-2)).join(", ");
          }
          if(street&&city&&state) {
            if(unique.length>3) warnings.push("国家位于地址末尾且包含多个地区片段；已按街道标记或门牌号定位街道，其余片段按原顺序填入城市、省州及区县，请在菜鸟页面创建前核对。");
            else warnings.push("国家位于地址末尾；已按街道标记或门牌号定位街道并按原顺序拆分城市和省州，请在菜鸟页面创建前核对。");
          } else needsReview=true;
        } else {
          street=unique[0]||""; city=unique[1]||""; state=unique[2]||"";
          if(unique.length>4) { district=unique.slice(3,-1).join(", "); street=[street,...unique.slice(-1)].filter(Boolean).join(", "); }
          needsReview=unique.length!==3;
        }
      } else {
        street=parts[0]||""; city=parts[1]||""; state=parts[2]||"";
        needsReview=true;
      }
    }
    if(postalCode&&addressLines.some(line=>new RegExp("\\b"+escapeRegex(postalCode)+"\\b").test(line))) warnings.push("已从地址文本中提取邮编 "+postalCode);
    if(initialCount>parts.length&&!warnings.length) warnings.push("已清理重复或空地址片段");
    if(!country) needsReview=true;
    const missing = [!postalCode && "邮编", !country && "国家代码", !state && "省/州", !city && "城市", !street && "街道"].filter(Boolean);
    if (missing.length) throw new Error("地址解析不完整，缺少"+missing.join("、")+"。请手动整理为“国家代码,省/州,城市,街道”格式后再检查。");
    if(needsReview) warnings.push("地址不符合明确的国家代码开头格式，解析结果需要人工核对；插件会暂停自动预填。");
    return { name, phone, postalCode, country, state, city, district, street, company: "", email: "", warnings:[...new Set(warnings)], needsReview };
  }
  globalThis.CainiaoAddress = { parseBuyerAddress };
})();
