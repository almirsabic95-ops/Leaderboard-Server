const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/igre', express.static('games')); // Omogućava direktno otvaranje igara

// Osiguraj da mape postoje
const mape = ['./public', './games', './data'];
mape.forEach(m => { if (!fs.existsSync(m)) fs.mkdirSync(m); });

// --- POST RUTE (Spremanje podataka) ---

app.post('/api/dodaj-igru', (req, res) => {
    const { naziv, sadrzaj } = req.body;
    const fileName = `${naziv.toLowerCase().replace(/ /g, '-')}.html`;
    fs.writeFileSync(`./games/${fileName}`, sadrzaj);
    res.json({ message: `Igra '${naziv}' je uspješno spremljena!` });
});

app.post('/api/dodaj-kviz', (req, res) => {
    const kvizData = req.body;
    const fileName = `${kvizData.kategorija.toLowerCase().replace(/ /g, '-')}.json`;
    let postojeciPodaci = [];
    if (fs.existsSync(`./data/${fileName}`)) {
        postojeciPodaci = JSON.parse(fs.readFileSync(`./data/${fileName}`));
    }
    postojeciPodaci.push(kvizData);
    fs.writeFileSync(`./data/${fileName}`, JSON.stringify(postojeciPodaci, null, 2));
    res.json({ message: `Pitanje spremljeno u kategoriju ${kvizData.kategorija}!` });
});

// --- NOVE GET RUTE (Čitanje podataka) ---

app.get('/api/lista-igara', (req, res) => {
    const files = fs.readdirSync('./games').filter(f => f.endsWith('.html'));
    res.json(files);
});

app.get('/api/lista-kvizova', (req, res) => {
    const files = fs.readdirSync('./data').filter(f => f.endsWith('.json'));
    res.json(files);
});

// Ruta za dohvaćanje specifičnog kviza
app.get('/api/kviz/:file', (req, res) => {
    const data = fs.readFileSync(`./data/${req.params.file}`);
    res.json(JSON.parse(data));
});

app.listen(PORT, () => console.log(`Server radi na http://localhost:${PORT}`));