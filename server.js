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
const PITANJA_FILE = './pitanja.json';

// Inicijalizacija baze ako ne postoji
if (!fs.existsSync(BODOVI_FILE)) fs.writeFileSync(BODOVI_FILE, JSON.stringify({}, null, 2));

let korisnici = JSON.parse(fs.readFileSync(BODOVI_FILE, 'utf8'));
let pitanjaPodaci = JSON.parse(fs.readFileSync(PITANJA_FILE, 'utf8'));

let trenutnaPitanja = {};
let tkoJePogodio = {};
let tajmeri = {};

function spremiBazu() { 
    fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2)); 
}

// AUTOMATSKO FILTRIRANJE PITANJA S INTERNETA U KATEGORIJE
async function dohvatiNovaPitanja() {
    try {
        const res = await axios.get('https://opentdb.com/api.php?amount=15&type=multiple');
        res.data.results.forEach(q => {
            let kat = 'kultura'; 
            const qat = q.category.toLowerCase();
            
            if(qat.includes('sport')) kat = 'sport';
            else if(qat.includes('history')) kat = 'povijest';
            else if(qat.includes('geography')) kat = 'zemljopis';
            else if(qat.includes('film') || qat.includes('television')) kat = 'film';
            else if(qat.includes('music')) kat = 'glazba';
            else if(qat.includes('science') || qat.includes('nature') || qat.includes('mathematics')) kat = 'znanost';
            
            pitanjaPodaci[kat].push({ 
                pitanje: q.question.replace(/&quot;/g, '"').replace(/&#039;/g, "'"), 
                odgovor: q.correct_answer 
            });
        });
        fs.writeFileSync(PITANJA_FILE, JSON.stringify(pitanjaPodaci, null, 2));
    } catch (e) { console.log("API trenutno nedostupan."); }
}
setInterval(dohvatiNovaPitanja, 3600000); 

function posaljiNovoPitanje(soba) {
    const kategorija = pitanjaPodaci[soba];
    if (kategorija && kategorija.length > 0) {
        const nasumicno = kategorija[Math.floor(Math.random() * kategorija.length)];
        trenutnaPitanja[soba] = nasumicno;
        tkoJePogodio[soba] = [];

        io.to(soba).emit('obavijest', { 
            poruka: `🔥 NOVO PITANJE: ${nasumicno.pitanje}`,
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

        if (soba === 'certifikati' && ime !== 'Blanco') {
            return socket.emit('greska_prijava', 'Ova soba je privatna!');
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
                
                io.to(soba).emit('obavijest', { 
                    poruka: `✅ ${ime} (+${bodoviZaDodati}b). Ukupno: ${korisnici[ime].bodovi}b`,
                    tip: 'tocno'
                });

                if (bodoviZaDodati === 7) {
                    clearTimeout(tajmeri[soba]);
                    setTimeout(() => posaljiNovoPitanje(soba), 4000);
                }
            }
        } else {
            io.to(soba).emit('nova_poruka', { ime, tekst });
        }
    });
});

server.listen(PORT, () => console.log(`Server pokrenut!`));