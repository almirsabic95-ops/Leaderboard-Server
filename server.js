const express = require('express');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const BODOVI_FILE = './bodovi.json';
const PITANJA_FOLDER = './pitanja/';

let korisnici = fs.existsSync(BODOVI_FILE) ? JSON.parse(fs.readFileSync(BODOVI_FILE, 'utf8')) : {};
let pitanjaPodaci = { kultura: [], sport: [], povijest: [], zemljopis: [], znanost: [], film: [], glazba: [], balkan: [], cisco: [] };

const API_MAPA = {
    9: 'kultura', 25: 'kultura',
    21: 'sport',
    23: 'povijest',
    22: 'zemljopis',
    17: 'znanost', 18: 'znanost', 19: 'znanost',
    11: 'film',
    12: 'glazba'
};

async function prevedi(tekst) {
    try {
        const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(tekst)}&langpair=en|bs`);
        return res.data.responseData.translatedText;
    } catch (e) { return tekst; }
}

async function dopuniPitanja() {
    console.log("🔄 Autopunjenje i prijevod u tijeku...");
    try {
        const res = await axios.get('https://opentdb.com/api.php?amount=15&type=multiple');
        if (res.data.results) {
            for (let p of res.data.results) {
                const mojaKat = API_MAPA[p.category_id];
                if (mojaKat) {
                    const q = await prevedi(p.question.replace(/&quot;/g, '"').replace(/&#039;/g, "'"));
                    const a = await prevedi(p.correct_answer);
                    pitanjaPodaci[mojaKat].push({ pitanje: q, odgovor: a });
                }
            }
            console.log("✅ Nove zalihe pitanja spremne.");
        }
    } catch (e) { console.log("❌ Greška kod povlačenja."); }
}

function ucitajLokalnaPitanja() {
    const datoteke = ['balkan.json', 'cisco.json', 'ostalo.json'];
    datoteke.forEach(f => {
        const p = PITANJA_FOLDER + f;
        if (fs.existsSync(p)) {
            try {
                const s = JSON.parse(fs.readFileSync(p, 'utf8'));
                for (let k in s) {
                    pitanjaPodaci[k] = [...(pitanjaPodaci[k] || []), ...s[k]];
                }
                console.log(`Učitano: ${f}`);
            } catch (e) { console.log(`Greška u datoteci ${f}:`, e.message); }
        }
    });
}

ucitajLokalnaPitanja();
dopuniPitanja();
setInterval(dopuniPitanja, 15 * 60 * 1000);

let trenutnaPitanja = {};
let tkoJePogodio = {};
let intervaliOdbrojavanja = {};

function posaljiNovoPitanje(soba) {
    const kat = pitanjaPodaci[soba];
    if (!kat || kat.length === 0) {
        io.to(soba).emit('obavijest', { poruka: "⏳ Čekam da server pripremi pitanja...", tip: 'sustav' });
        return;
    }
    
    const p = kat[Math.floor(Math.random() * kat.length)];
    trenutnaPitanja[soba] = p;
    tkoJePogodio[soba] = [];
    io.to(soba).emit('obavijest', { poruka: `❓ ${p.pitanje}`, tip: 'sustav' });

    let tajmer = 30;
    if (intervaliOdbrojavanja[soba]) clearInterval(intervaliOdbrojavanja[soba]);
    intervaliOdbrojavanja[soba] = setInterval(() => {
        tajmer--;
        if (tajmer === 15 || tajmer <= 5) io.to(soba).emit('obavijest', { poruka: `⏱️ ${tajmer}s`, tip: 'tajmer' });
        if (tajmer <= 0) {
            clearInterval(intervaliOdbrojavanja[soba]);
            io.to(soba).emit('obavijest', { poruka: `⌛ Odgovor je bio: ${p.odgovor}`, tip: 'sustav' });
            setTimeout(() => posaljiNovoPitanje(soba), 4000);
        }
    }, 1000);
}

io.on('connection', (socket) => {
    socket.on('prijava', (d) => {
        if (!korisnici[d.ime]) {
            if (!d.tajnaSifra) return socket.emit('prikazi_registraciju');
            korisnici[d.ime] = { lozinka: d.lozinka, tajnaSifra: d.tajnaSifra, povijest: [] };
            fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2));
        }
        socket.ime = d.ime;
        socket.emit('uspjesna_prijava', { ime: d.ime, jeAdmin: d.ime === 'Blanco' });
    });

    socket.on('join_room', (soba) => {
        socket.leaveAll(); socket.join(soba); socket.trenutnaSoba = soba;
        if (!trenutnaPitanja[soba]) posaljiNovoPitanje(soba);
    });

    socket.on('slanje_odgovora', (data) => {
        const soba = socket.trenutnaSoba; 
        const akt = trenutnaPitanja[soba];
        if (!akt || !socket.ime || tkoJePogodio[soba].includes(socket.ime)) return;

        if (akt.odgovor.toLowerCase().trim() === data.tekst.toLowerCase().trim()) {
            clearInterval(intervaliOdbrojavanja[soba]);
            let iznos = tkoJePogodio[soba].length === 0 ? 7 : 5;
            korisnici[socket.ime].povijest.push({ iznos, kategorija: soba, vrijeme: Date.now() });
            tkoJePogodio[soba].push(socket.ime);
            fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2));
            io.to(soba).emit('obavijest', { poruka: `✅ ${socket.ime} je POGODIO! (+${iznos}b)`, tip: 'tocno' });
            setTimeout(() => posaljiNovoPitanje(soba), 3000);
        } else {
            socket.emit('obavijest', { poruka: `❌ Netočno!`, tip: 'netocno' });
        }
    });
});

server.listen(PORT, () => console.log('Arena radi na portu ' + PORT));