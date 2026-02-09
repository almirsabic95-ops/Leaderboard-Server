// Učitaj mape čim se admin panel otvori
window.onload = async () => {
    const res = await fetch('/api/kategorije-igara');
    const mape = await res.json();
    const select = document.getElementById('categorySelect');
    mape.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.innerText = m;
        select.appendChild(opt);
    });
};

async function posaljiIgru() {
    const naziv = document.getElementById('gameName').value;
    const sadrzaj = document.getElementById('gameContent').value;
    const izabranaMapa = document.getElementById('categorySelect').value;
    const novaMapa = document.getElementById('newCategory').value.trim();
    
    const kategorija = novaMapa !== "" ? novaMapa : izabranaMapa;

    if(!naziv || !sadrzaj) return alert("Naziv i kod su obavezni!");

    const res = await fetch('/api/dodaj-igru', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naziv, kategorija, sadrzaj })
    });

    const result = await res.json();
    alert(result.message);
    location.reload(); 
}