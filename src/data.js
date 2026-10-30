// Contenuti ufficiali La Riccia delle Tremiti (fonte: laricciadelletremiti.it)

export const CONTACT = {
  phone: '+39 348 917 1971',
  phoneRaw: '393489171971',
  email: 'info@laricciadelletremiti.it',
  address: 'Via Largo delle Muraglie 12, Isole Tremiti (FG)',
  office: 'Porto di San Domino · Biglietteria n. 13',
  instagram: 'https://www.instagram.com/laricciadelletremiti/',
  facebook: 'https://www.facebook.com/angelicatremiti',
  piva: '04447010713',
  cin: 'IT071026C200064409',
};

export const waLink = (text) =>
  `https://wa.me/${CONTACT.phoneRaw}?text=${encodeURIComponent(text)}`;

// Ogni barca ha la sua foto reale (dal sito laricciadelletremiti.it); i colori servono al modello 3D del viaggio.
export const FLEET = [
  { id: 'predator-600', name: 'Predator', length: 6.0, cat: 'Premium', hp: 40, seats: 10, photo: 'predator-600m', tube: '#eceeef', hull: '#f4f4f2', canopy: '#f1efe9' },
  { id: 'cayman', name: 'Cayman', length: 5.9, cat: 'Premium', hp: 40, seats: 8, photo: 'cayman-590m', tube: '#eef0f1', hull: '#ffffff', canopy: '#f1efe9' },
  { id: '2bar', name: '2BAR', length: 5.7, cat: 'Premium', hp: 40, seats: 8, photo: '2bar-570m', tube: '#eceeef', hull: '#f2f2f0', canopy: '#f1efe9' },
  { id: 'predator-570', name: 'Predator', length: 5.7, cat: 'Premium', hp: 40, seats: 8, photo: 'predator-570m', tube: '#eceeef', hull: '#f4f4f2', canopy: '#f1efe9' },
  { id: 'bsc', name: 'BSC', length: 5.5, cat: 'Comfort', hp: 40, seats: 8, photo: 'bsc-550m', tube: '#eef0f1', hull: '#ffffff', canopy: '#f1efe9' },
  { id: 'tempest', name: 'Tempest', length: 5.3, cat: 'Comfort', hp: 40, seats: 8, photo: 'tempest-530m', tube: '#f1f2f2', hull: '#f7f7f5', canopy: '#1f2328' },
  { id: 'marco', name: 'Mar.Co', length: 5.1, cat: 'Comfort', hp: 40, seats: 8, photo: 'marco-510m', tube: '#eef0f1', hull: '#f7f7f5', canopy: '#f1efe9' },
  { id: 'king', name: 'King', length: 4.9, cat: 'Comfort', hp: 40, seats: 7, photo: 'king-nuova-jolly-490m', tube: '#eef0f1', hull: '#ffffff', canopy: '#f1efe9' },
  { id: 'callegari', name: 'Callegari', length: 4.5, cat: 'Comfort', hp: 40, seats: 2, photo: 'callegari-450m', tube: '#eef0f1', hull: '#f7f7f5', canopy: '#f1efe9' },
  { id: 'grigione', name: 'Grigione', length: 4.2, cat: 'Enjoy', hp: 20, seats: 4, photo: 'grigione-420m', tube: '#6b7178', hull: '#f2f2f0', canopy: '#f1efe9' },
  { id: 'lomac', name: 'Lomac', length: 4.2, cat: 'Enjoy', hp: 20, seats: 2, photo: 'lomac-420m', tube: '#eceeef', hull: '#ffffff', canopy: '#f1efe9' },
  { id: 'g43', name: 'Legar G43', length: 4.2, cat: 'Enjoy', hp: 30, seats: 5, photo: 'g43-420m', tube: '#e6e9eb', hull: '#ffffff', canopy: '#f1efe9' },
  { id: 'lomacchino', name: 'Lomacchino', length: 4.0, cat: 'Enjoy', hp: 20, seats: 2, photo: 'lomacchino-400m', tube: '#eceeef', hull: '#ffffff', canopy: '#f1efe9' },
];

export const CATEGORIES = {
  Premium: 'Top di gamma: più spazio, più comfort, prendisole a prua.',
  Comfort: 'L’equilibrio perfetto per famiglie e coppie.',
  Enjoy: 'Piccole e agili, ideali per brevi escursioni.',
};

// Capitoli del viaggio 3D (la camera e la barca seguono queste tappe); `label` è la voce nella barra laterale
export const CHAPTERS = [
  { key: 'hero', label: 'Inizio', title: 'Il mare delle Tremiti,<br><em>al tuo timone.</em>', text: 'Noleggio gommoni senza patente e tour guidati dal porto di San Domino. Scorri e salpa con noi, o guarda il viaggio.' },
  { key: 'porto', label: 'Porto di San Domino', title: 'Si parte dalla <em>biglietteria 13</em>', text: 'Briefing sulla guida e sui punti da non perdere, giubbotti a bordo, chiavi in mano. Senza patente nautica.' },
  { key: 'matano', label: 'Cala Matano', title: 'L’acqua cambia colore <em>metro dopo metro</em>', text: 'Ancora lontano dalla riva, tuffo dalla scaletta, doccetta e frigo a bordo. Il resto lo fa il mare.' },
  { key: 'bue', label: 'Bue Marino', title: 'Le grotte, <em>viste dal mare</em>', text: 'Bue Marino, Viole, Rondinelle: le falesie di San Domino si ammirano dall’esterno, motore al minimo.' },
  { key: 'architiello', label: 'Architiello', title: 'Un arco scolpito <em>dal vento e dalle onde</em>', text: 'Il giro completo delle isole si fa con calma in un paio d’ore. Hai tutto il giorno per fermarti dove vuoi.' },
  { key: 'elefante', label: 'Scoglio dell’Elefante', title: 'Un profilo che <em>riconoscerai subito</em>', text: 'Ti indichiamo noi gli angoli nascosti: sono le rotte che Angelica ha imparato da suo padre, pescatore.' },
  { key: 'capraia', label: 'Padre Pio', title: 'Giù, fino a <em>Padre Pio</em>', text: 'Nell’area marina di Capraia la statua del santo ti aspetta sul fondale, a braccia aperte. Le nostre barche hanno il permesso per arrivarci sopra: maschera e tuffo.' },
  { key: 'nicola', label: 'San Nicola', title: 'Attracca, pranza, <em>sali al castello</em>', text: 'Pontili nostri a San Domino e San Nicola, assistenza gratuita tutto il giorno. Si rientra nel pomeriggio.' },
];

export const FAQ = [
  ['Posso guidare senza patente nautica?', 'Sì: tutte le barche sono fino a 40 cv. Prima di partire ricevi un briefing sulla guida e sui punti dell’isola da visitare. Tanti clienti guidano per la prima volta: basta seguire le indicazioni.'],
  ['Quali documenti servono?', 'Un documento d’identità. A bordo trovi una cartellina con libretto, assicurazione e ricevuta fiscale, da mostrare in caso di controllo della Capitaneria.'],
  ['Quali sono gli orari di noleggio?', 'Per la sicurezza di tutti il noleggio va dalle 9:00 alle 17:00.'],
  ['Dove posso andare con la barca?', 'Le isole sono piccole: il giro completo si fa con calma in circa 2 ore. Si può entrare nell’area marina di Capraia fino alla statua sommersa di Padre Pio. Nelle grotte non si entra e si ancora ad almeno 100 m dalla costa.'],
  ['Possono salire bambini e chi non sa nuotare?', 'Sì. Ogni barca ha tendalino parasole e giubbotti di salvataggio.'],
  ['Cosa c’è a bordo?', 'Stereo, frigo, doccetta e tendalino. I cuscini sono presenti sui modelli da 5 m con 40 cv.'],
  ['Posso portare il mio animale?', 'Sì, gli animali sono i benvenuti.'],
  ['E se il tempo è brutto?', 'Con mare o meteo avverso le barche non escono per sicurezza e l’acconto viene restituito al 100%.'],
  ['C’è la copertura Kasko?', 'No. La barca ha l’assicurazione RC; i danni alla barca o a terzi sono a carico del cliente. Prima di partire controlliamo insieme elica, tendalino e scaletta.'],
  ['Come prenoto e come pago l’acconto?', 'Scrivi su WhatsApp al 348 917 1971 numero di persone, data e barca scelta, allegando un documento. Ti invieremo l’IBAN per l’acconto con bonifico.'],
  ['Se rientro prima, ho un rimborso?', 'No: una volta noleggiata la barca, il rientro anticipato non dà diritto a rimborso.'],
  ['Si può pescare o fare sci nautico?', 'La pesca è sconsigliata; traino e sci nautico non sono consentiti e durante la navigazione si resta seduti.'],
];
