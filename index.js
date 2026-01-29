const express = require('express');
const fs = require('fs');
const app = express();
const PORT =process.env.PORT || 3000;
const putanja = './rezultati.json';
function snimiFajl() {fs.writeFileSync(putanja,JSON.stringify(tabela)); }

// Naša privremena baza podataka (niz objekata)
let tabela = [ { ime: "Almir", bodovi: 100 } ];
if (fs.existsSync(putanja)) {tabela = JSON.parse(fs.readFileSync(putanja));
}

// 1. Ruta za prikaz tabele (Leaderboard)
app.get('/', (req, res) => {
    let ispis = "<h1>Leaderboard</h1><ul>";
    tabela.sort((a, b) => b.bodovi - a.bodovi); //Sortiraj od najvećeg rezultata
    tabela.forEach(igrac => {
    ispis += `<li>${igrac.ime}: ${igrac.bodovi}</li>`;
    });
    ispis += "</ul><p>Dodaj bodove preko URL-a: /spasi?ime=Ime&bodovi=50</p>";
    res.send(ispis);
    });

    // 2. Ruta za SPAŠAVANJE novih bodova
    app.get('/spasi', (req, res) => {const ime = req.query.ime;
    const bodovi = parseInt(req.query.bodovi);

    if (ime && bodovi) {tabela.push({ ime: ime, bodovi: bodovi });
    res.send(`Uspješno spremljeno: ${ime} ima ${bodovi} bodova! <a href="/">Vrati se na tabelu</a>`);
    snimiFajl();
    } else {
        res.send("Greška! Nedostaju podaci.");
    }
});
    // 3. Pokretanje servera
    app.listen(PORT, () => {console.log(`Leaderboard server radi na http://localhost:${PORT}`);
    });