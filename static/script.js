async function loadSlips(){
 const res = await fetch('/api/slips');
 const slips = await res.json();
 document.getElementById('slips').innerHTML = slips.map((s,i)=>
  `<div><pre>${s.text}</pre>
  <button onclick="navigator.clipboard.writeText(${JSON.stringify("")}+document.querySelectorAll('pre')[${i}].innerText)">Copy</button>
  <button onclick="deleteSlip(${i})">Delete</button></div>`
 ).join('');
}
async function saveSlip(){
 await fetch('/api/slips',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({text:document.getElementById('text').value})});
 document.getElementById('text').value='';
 loadSlips();
}
async function deleteSlip(i){
 await fetch('/api/slips/'+i,{method:'DELETE'});
 loadSlips();
}
loadSlips();
if('serviceWorker' in navigator){ navigator.serviceWorker.register('/static/sw.js'); }
