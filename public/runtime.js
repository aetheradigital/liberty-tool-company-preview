/* LTC preview runtime: renders the page template, keeps DOM nodes between updates (focus, file inputs and scroll survive). */
(function(){
var SVG='http://www.w3.org/2000/svg';
function get(ctx,p){p=p.trim();if(p==='true')return true;if(p==='false')return false;if(/^-?\d+(\.\d+)?$/.test(p))return Number(p);return p.split('.').reduce(function(o,k){return o==null?undefined:o[k];},ctx);}
function interp(s,ctx){return s.replace(/\{\{([^}]+)\}\}/g,function(m,p){var v=get(ctx,p);return v==null?'':String(v);});}
function whole(s){var m=/^\s*\{\{([^}]+)\}\}\s*$/.exec(s);return m?m[1]:null;}
function build(node,ctx,parent){
  if(node.nodeType===3){parent.appendChild(document.createTextNode(interp(node.nodeValue,ctx)));return;}
  if(node.nodeType!==1)return;
  var tag=node.tagName.toLowerCase();
  if(tag==='sc-for'){var list=get(ctx,whole(node.getAttribute('list')))||[];var as=node.getAttribute('as');list.forEach(function(it,i){var c=Object.create(ctx);c[as]=it;c.$index=i;node.childNodes.forEach(function(ch){build(ch,c,parent);});});return;}
  if(tag==='sc-if'){if(get(ctx,whole(node.getAttribute('value'))))node.childNodes.forEach(function(ch){build(ch,ctx,parent);});return;}
  var isSvg=tag==='svg'||parent.namespaceURI===SVG;
  var el=isSvg?document.createElementNS(SVG,node.tagName):document.createElement(tag);
  el.__h={};
  for(var i=0;i<node.attributes.length;i++){var a=node.attributes[i];var w=whole(a.value);
    if(/^on[A-Za-z]+$/.test(a.name)&&w){var fn=get(ctx,w);var ev=a.name.slice(2).toLowerCase();if(ev==='change')ev='input';if(typeof fn==='function')el.__h[ev]=fn;continue;}
    if(a.name==='disabled'){if(w?get(ctx,w):true)el.setAttribute('disabled','');continue;}
    if(a.name==='value'&&w&&(tag==='input'||tag==='select'||tag==='textarea')){el.__v=get(ctx,w);continue;}
    el.setAttribute(a.name,interp(a.value,ctx));}
  var kids=tag==='template'?node.content.childNodes:node.childNodes;
  kids.forEach(function(ch){build(ch,ctx,el);});
  parent.appendChild(el);
}
function wire(el){ if(!el.__h)return; el.__bound=el.__bound||{}; Object.keys(el.__h).forEach(function(ev){ if(!el.__bound[ev]){ el.__bound[ev]=true; el.addEventListener(ev,function(e){var f=el.__h&&el.__h[ev]; if(f)f(e);}); } }); }
function setVal(el){ if(el.__v===undefined)return; if(document.activeElement===el&&el.type!=='range')return; if(el.value!==String(el.__v))el.value=el.__v==null?'':el.__v; }
function morph(o,n){
  if(o.nodeType!==n.nodeType||o.nodeName!==n.nodeName){o.parentNode.replaceChild(n,o);finish(n);return;}
  if(o.nodeType===3){if(o.nodeValue!==n.nodeValue)o.nodeValue=n.nodeValue;return;}
  var i,a;
  for(i=o.attributes.length-1;i>=0;i--){a=o.attributes[i].name;if(!n.hasAttribute(a))o.removeAttribute(a);}
  for(i=0;i<n.attributes.length;i++){a=n.attributes[i];if(o.getAttribute(a.name)!==a.value)o.setAttribute(a.name,a.value);}
  o.__h=n.__h; o.__v=n.__v; wire(o);
  var oc=Array.prototype.slice.call(o.childNodes), nc=Array.prototype.slice.call(n.childNodes);
  for(i=0;i<nc.length;i++){ if(i<oc.length)morph(oc[i],nc[i]); else {o.appendChild(nc[i]);finish(nc[i]);} }
  for(i=nc.length;i<oc.length;i++)o.removeChild(oc[i]);
  if(o.tagName==='INPUT'||o.tagName==='SELECT'||o.tagName==='TEXTAREA')setVal(o);
}
function finish(el){ if(el.nodeType!==1)return; wire(el); if(el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA')setVal(el); for(var c=el.firstChild;c;c=c.nextSibling)finish(c); }
window.DCLogic=function(props){this.props=props||{};this.state={};};
DCLogic.prototype.setState=function(o){Object.assign(this.state,typeof o==='function'?o(this.state):o);if(window.__ltcSave){try{window.__ltcSave(this.state);}catch(e){}}schedule();};
DCLogic.prototype.forceUpdate=function(){schedule();};
var comp,root,tpl,queued=false;
function render(){queued=false;var ctx=comp.renderVals();var fresh=document.createElement('div');tpl.content.childNodes.forEach(function(ch){build(ch,ctx,fresh);});
  if(!root.firstChild){while(fresh.firstChild){var c=fresh.firstChild;root.appendChild(c);finish(c);}} else morph(root,(function(){var r=root.cloneNode(false);while(fresh.firstChild)r.appendChild(fresh.firstChild);return r;})());}
function schedule(){if(!queued){queued=true;(window.queueMicrotask||setTimeout)(render);}}
window.__ltcStart=function(Cls){tpl=document.getElementById('tpl');root=document.getElementById('root');comp=new Cls({});window.__comp=comp;if(window.__ltcRestore){try{window.__ltcRestore(comp);}catch(e){}}render();};
})();
