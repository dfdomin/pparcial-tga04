/* Grading mirrors the published instructions, not a literal print format. */
(function(root){
  'use strict';
  function norm(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
  function numberValues(raw){
    var s=String(raw),values=[],parts=s.split(/[.,]/),marks=s.match(/[.,]/g)||[];
    if(!marks.length)return [Number(s)];
    if(marks.length===1){
      values.push(Number(s.replace(',','.')));
      if(/^[+-]?[1-9]\d{0,2}[.,]\d{3}$/.test(s))values.push(Number(s.replace(/[.,]/g,'')));
    }else if(marks.every(function(x){return x===marks[0];})){
      if(/^[+-]?[1-9]\d{0,2}(?:[.,]\d{3})+$/.test(s))values.push(Number(s.replace(/[.,]/g,'')));
    }else{
      var last=Math.max(s.lastIndexOf('.'),s.lastIndexOf(',')),intPart=s.slice(0,last),fraction=s.slice(last+1);
      if(/^[+-]?[1-9]\d{0,2}(?:[.,]\d{3})+$/.test(intPart)&&/^\d+$/.test(fraction))values.push(Number(intPart.replace(/[.,]/g,'')+'.'+fraction));
    }
    return values.filter(Number.isFinite);
  }
  function tokens(text){
    var result=[],re=/[+-]?\d+(?:[.,]\d+)*(?:[eE][+-]?\d+)?/g,m;
    while((m=re.exec(String(text)))){
      // A month/variable label such as Q2 is not a numeric result.
      if(m.index&&/[\p{L}\p{N}_]/u.test(text[m.index-1]))continue;
      result.push(numberValues(m[0]));
    }
    return result;
  }
  function matches(token,want,tolerance){return token&&token.some(function(n){return Math.abs(n-want)<=tolerance;});}
  function association(text,re,kind){
    var normalized=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    var labels=[],m;while((m=re.exec(normalized)))labels.push({kind:kind(m[0]),start:m.index,end:re.lastIndex});
    var found={};labels.forEach(function(label,i){
      var values=tokens(normalized.slice(label.end,i+1<labels.length?labels[i+1].start:normalized.length));
      // Consecutive synonyms ('Suma total') describe the same number.
      if(!values.length&&i+1<labels.length&&label.kind===labels[i+1].kind)return;
      (found[label.kind]||(found[label.kind]=[])).push(values[0]||[]);
    });return found;
  }
  function grade(q,text,v,analysis){
    var parts=q.outputMatch(v).split('\n').filter(function(x){return x.trim();}),missing=[],txt=String(text||'').trim();
    function verdict(){return {ok:txt.length>0&&!missing.length,parts:parts,missing:missing};}
    if(!txt){missing=parts.map(function(_,i){return i;});return verdict();}
    if(q.num===2){
      parts=[String(v.empresa),'mensaje descriptivo'];
      var at=txt.indexOf(parts[0]);if(at<0)missing.push(0);
      var rest=at<0?'':txt.slice(0,at)+txt.slice(at+parts[0].length);
      if(!/[\p{L}]/u.test(rest))missing.push(1);
      return verdict();
    }
    if(q.num===7){
      var hi=Number(parts[0]),lo=Number(parts[1]);
      var a=association(txt,/\b(?:mayor|maximo|max|menor|minimo|min)\b/g,function(s){return /^(mayor|maximo|max)$/.test(s)?'hi':'lo';});
      if(a.hi||a.lo){
        if(!a.hi||!a.hi.every(function(x){return matches(x,hi,1e-9);}))missing.push(0);
        if(!a.lo||!a.lo.every(function(x){return matches(x,lo,1e-9);}))missing.push(1);
      }else{
        var bare=tokens(txt);
        if(!matches(bare[0],hi,1e-9))missing.push(0);
        if(!matches(bare[1],lo,1e-9)||bare.length!==2)missing.push(1);
      }
      return verdict();
    }
    if(q.num===9){
      var labels=association(txt,/\b(?:total|suma|acumulad[oa]s?|promedio|media)\b/g,function(s){return /^(promedio|media)$/.test(s)?'avg':'total';});
      if(!labels.total)missing.push(0);else if(!labels.total.every(function(x){return matches(x,Number(parts[1]),1e-9);}))missing.push(1);
      if(!labels.avg)missing.push(2);else if(!labels.avg.every(function(x){return matches(x,Number(parts[3]),0.051);}))missing.push(3);
      return verdict();
    }
    var nums=tokens(txt),normalized=norm(txt);
    parts.forEach(function(part,i){
      if(/^-?\d+(?:\.\d+)?$/.test(part)){
        var tolerance=q.num===6?0.051:1e-9;
        if(!nums.some(function(t){return matches(t,Number(part),tolerance);}))missing.push(i);
      }else if(normalized.indexOf(norm(part))<0)missing.push(i);
    });
    if(q.num===8&&analysis){
      var inputs=analysis.numericValues||[];
      if(!analysis.arithmetic||!inputs.includes(Number(v.total_compra))||!inputs.includes(Number(v.pago_con)))missing.push(0);
    }
    return verdict();
  }
  root.PPGrading={grade:grade};
  if(typeof module!=='undefined')module.exports=root.PPGrading;
})(typeof window==='undefined'?globalThis:window);
