async function posaljiIgru() {
    const naziv = document.getElementById('gameName').value;
    const sadrzaj = document.getElementById('gameContent').value;
    if(!naziv || !sadrzaj) return alert("Popuni sva polja!");

    const res = await fetch('/api/dodaj-igru', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naziv, sadrzaj })
    });
    const result = await res.json();
    alert(result.message);
}

async function posaljiKviz() {
    const odgovoriInput = document.getElementById('quizOptions').value;
    // Ako je prazno, šalje prazan niz, inače siječe zarezima
    const odgovoriNiz = odgovoriInput.trim() === "" ? [] : odgovoriInput.split(',').map(s => s.trim());

    const payload = {
        kategorija: document.getElementById('quizCat').value,
        pitanje: document.getElementById('quizQuestion').value,
        odgovori: odgovoriNiz,
        tocan: document.getElementById('quizCorrect').value.trim(),
        username: document.getElementById('quizUser').value
    };

    const res = await fetch('/api/dodaj-kviz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await res.json();
    alert(result.message);
}

document.getElementById('btnIgra').addEventListener('click', posaljiIgru);
document.getElementById('btnKviz').addEventListener('click', posaljiKviz);