const cards=[...document.querySelectorAll(".tool-card[data-search]")];
const grid=document.getElementById("toolGrid");
if(grid){
  grid.innerHTML=cards.slice(0,10).map(c=>c.outerHTML).join("");
}
const input=document.getElementById("toolSearch"), results=document.getElementById("searchResults");
if(input){
 input.addEventListener("input",()=>{
  const q=input.value.trim().toLowerCase();
  if(!q){results.style.display="none";results.innerHTML="";return}
  const matches=cards.filter(c=>(c.dataset.search+" "+c.innerText).toLowerCase().includes(q)).slice(0,8);
  results.innerHTML=matches.length?matches.map(c=>`<a href="${c.getAttribute("href")}"><b>${c.querySelector("h3").innerText}</b><br><small>${c.querySelector("p").innerText}</small></a>`).join(""):`<div style="padding:15px;color:#687588">Tool belum ditemukan. Coba kata kunci lain.</div>`;
  results.style.display="block";
 });
}
