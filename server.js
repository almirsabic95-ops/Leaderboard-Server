const express = require('express');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); // Potrebno instalirati: npm install axios

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const BODOVI_FILE = './bodovi.json';
const PITANJA_FILE = './pitanja.json';

let korisnici = fs.existsSync(BODOVI_FILE) ? JSON.parse(fs.readFileSync(BODOVI_FILE, 'utf8')) : {};
let pitanjaPodaci = JSON.parse(fs.readFileSync(PITANJA_FILE, 'utf8'));

let trenutnaPitanja = {};
let tkoJePogodio = {};
let tajmeri = {};

function spremiBazu() { fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2)); }

// FUNKCIJA ZA PREUZIMANJE NOVIH PITANJA S INTERNETA
async function dohvatiNovaPitanja() {
    try {
        const res = await axios.get('https://opentdb.com/api.php?amount=10&type=manual');
        res.data.results.forEach(q => {
            const kat = q.category.toLowerCase().includes('sport') ? 'sport' : 'kultura';
            pitanjaPodaci[kat].push({ pitanje: q.question, odgovor: q.correct_answer });
        });
        fs.writeFileSync(PITANJA_FILE, JSON.stringify(pitanjaPodaci, null, 2));
        console.log("Baza pitanja dopunjena s interneta.");
    } catch (e) { console.log("Greška pri dohvaćanju pitanja."); }
}
setInterval(dohvatiNovaPitanja, 3600000); // Svakih sat vremena dopuni bazu

function posaljiNovoPitanje(soba) {
    const kategorija = pitanjaPodaci[soba];
    if (kategorija && kategorija.length > 0) {
        const nasumicno = kategorija[Math.floor(Math.random() * kategorija.length)];
        trenutnaPitanja[soba] = nasumicno;
        tkoJePogodio[soba] = [];

        io.to(soba).emit('obavijest', { 
            poruka: `🔥 NOVO PITANJE: ${nasumicno.pitanje} (Prvi: 7b, ostali: 5b)`,
            tip: 'sustav'
        });

        if (tajmeri[soba]) clearTimeout(tajmeri[soba]);
        tajmeri[soba] = setTimeout(() => {
            io.to(soba).emit('obavijest', { poruka: `Vrijeme isteklo! Odgovor: ${nasumicno.odgovor}` });
            setTimeout(() => posaljiNovoPitanje(soba), 3000);
        }, 30000);
    }
}

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        const { soba, ime, lozinka, tajnaSifra } = data;

        // Privatnost za tvoje certifikate
        if (soba === 'certifikati' && ime !== 'Blanco') {
            return socket.emit('greska_prijava', 'Samo Blanco može pristupiti certifikatima!');
        }

        if (korisnici[ime]) {
            if (korisnici[ime].lozinka !== lozinka) return socket.emit('greska_prijava', 'Netočna lozinka!');
        } else {
            korisnici[ime] = { lozinka, tajnaSifra, bodovi: 0 };
            spremiBazu();
        }

        socket.join(soba);
        socket.emit('uspjesna_prijava', { ime, bodovi: korisnici[ime].bodovi });
        if (!trenutnaPitanja[soba]) posaljiNovoPitanje(soba);
    });

    socket.on('slanje_odgovora', (data) => {
        const { soba, ime, tekst } = data;
        const aktivno = trenutnaPitanja[soba];
        if (aktivno && aktivno.odgovor.toLowerCase().trim() === tekst.toLowerCase().trim()) {
            if (!tkoJePogodio[soba].includes(ime)) {
                let bodoviZaDodati = tkoJePogodio[soba].length === 0 ? 7 : 5;
                korisnici[ime].bodovi += bodoviZaDodati;
                tkoJePogodio[soba].push(ime);
                spremiBazu();
                io.to(soba).emit('obavijest', { poruka: `✅ ${ime} (+${bodoviZaDodati}b). Ukupno: ${korisnici[ime].bodovi}` });
                if (bodoviZaDodati === 7) {
                    clearTimeout(tajmeri[soba]);
                    setTimeout(() => posaljiNovoPitanje(soba), 5000);
                }
            }
        } else {
            io.to(soba).emit('nova_poruka', { ime, tekst });
        }
    });
});

server.listen(PORT, () => console.log(`Server pokrenut!`));