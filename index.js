const express = require('express');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const aplikacija = express();
const PORT = process.env.PORT || 3000;
const putanja = './rezultati.json';

app.use(cors());

// Funkcija za snimanje u lokalni fajl
function snimiFajl() {
    fs.writeFileSync(putanja, JSON.stringify(tabela)); 
}

// Uvoz modula - popravljen razmak u putanji
const logickeIgre = require('./igre/logicke');

// Nasa privremena baza podataka
let tabela = [{ ime: "Almir", bodovi: 100 }];

if (fs.existsSync(putanja)) {
    tabela = JSON.parse(fs.readFileSync(putanja));
}

// Ruta za spasavanje bodova s kategorijom
app.get('/', (req, res) => {
    let ispis = "<h1 style='font-family: sans-serif;'>Ljestvica po kategorijama</h1>";
    
    // Izvlačenje jedinstvenih kategorija (npr. Reach7, Ostalo...)
    const kategorije = [...new Set(tabela.map(stavka => stavka.igra || "Ostalo"))];

    kategorije.forEach(kat => {
        ispis += `<div style='margin-bottom: 20px; border-bottom: 1px solid #ccc;'>
                    <h2 style='color: #2c3e50;'>Igra: ${kat}</h2><ul>`;
        
        const filtrirano = tabela
            .filter(i => (i.igra || "Ostalo") === kat)
            .sort((a, b) => b.bodovi - a.bodovi);

        filtrirano.slice(0, 10).forEach(igrac => {
            ispis += `<li><strong>${igrac.ime}</strong>: ${igrac.bodovi}</li>`;
        });
        ispis += "</ul></div>";
    });
    
    ispis += "<p>Primjer slanja: <code>/spasi?ime=Ime&bodovi=100&igra=Reach7</code></p>";
    res.send(ispis);
});

// --- Spremanje (Ruta '/spasi') ---
app.get('/spasi', (req, res) => {
    const ime = req.query.ime;
    const bodovi = parseInt(req.query.bodovi);
    const igra = req.query.igra || "Ostalo"; // Uzima kategoriju iz URL-a

    if (ime && !isNaN(bodovi)) {
        tabela.push({ ime: ime, bodovi: bodovi, igra: igra });
        snimiFajl();

        // Ako je igra Reach7, šaljemo je dalje na originalni server
        if (igra === "Reach7") {
            logickeIgre.reach7(bodovi); // Pazi: provjeri zove li se u logicke.js funkcija 'reach7' ili 'submitScore'
        }

        res.send(`Uspješno spremljeno: ${ime} ima ${bodovi} bodova u kategoriji ${igra}!`);
    } else {
        res.status(400).send("Greška! Nedostaju podaci (ime, bodovi).");
    }
});

app.listen(PORT, () => {
    console.log(`Server radi na portu ${PORT}`);
});

// 1. Putanja za prikaz tabele (Leaderboard)
aplikacija.get('/', (req, res) => {
    let ispis = "<h1>Ljestvica najboljih</h1><ul>";
    tabela.sort((a, b) => b.bodovi - a.bodovi); // Sortiranje od najveceg rezultata
    tabela.forEach(igrac => {
        ispis += `<li>${igrac.ime}: ${igrac.bodovi}</li>`;
    });
    ispis += "</ul><p>Dodaj bodove preko URL-a: /spasi?ime=Ime&bodovi=50</p>";
    res.send(ispis);
});

// 2. Putanja za SPASAVANJE novih bodova
aplikacija.get('/spasi', (req, res) => {
    const ime = req.query.ime;
    const bodovi = parseInt(req.query.bodovi);

    if (ime && bodovi) {
        tabela.push({ ime: ime, bodovi: bodovi });
        res.send(`Uspjesno spremljeno: ${ime} ima ${bodovi} bodova! <a href="/">Vrati se na ljestvicu</a>`);
        snimiFajl();
        
        // Slanje bodova na vanjski server preko logicke.js
        logickeIgre.posaljiReach7(bodovi);
    } else {
        res.send("Greska! Nedostaju podaci.");
    }
});

// 3. Pokretanje servera
aplikacija.listen(PORT, () => {
    console.log(`Server ljestvice radi na http://localhost:${PORT}`);
});

// Self-ping opcija da server ne zaspi na Renderu
setInterval(() => {
    https.get('https://leaderboard-server-002x.onrender.com/', (res) => {
        console.log('Ping poslan: Status', res.statusCode);
    }).on('error', (err) => {
        console.log('Ping greska: ' + err.message); 
    });
}, 600000); // 10 minuta