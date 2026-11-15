// French + Italian replies for the POD.AI site chat (templates, chips and knowledge answers).
// Merged into the EN / ZH / DE tables of agent.js and knowledge.js so FR / IT shoppers get answers in their language.
const money = (cur, n) => `${cur} ${Number(n || 0).toFixed(2)}`;
const pct = r => (r * 100).toFixed(1);

export const T_FR_IT = {
  greet: { fr: "Bonjour ! Je suis l'assistant POD.AI. Je peux vous recommander des produits, calculer prix et frais de port, et suivre votre commande.", it: "Ciao! Sono l'assistente POD.AI. Posso consigliarle prodotti, calcolare prezzi e spedizione e controllare il suo ordine." },
  thanks: { fr: "Avec plaisir ! Puis-je vous aider pour autre chose ?", it: "Prego! Posso aiutarla in altro?" },
  askProduct: { fr: "Pour quel produit souhaitez-vous un devis ? Par exemple des faire-part, cartes de menu ou marque-places.", it: "Per quale prodotto desidera un preventivo? Ad esempio inviti, menù o segnaposto." },
  askCountry: { fr: "Dans quel pays devons-nous livrer ?", it: "In quale paese dobbiamo spedire?" },
  quote: {
    fr: v => `${v.qty} × ${v.product} vers ${v.country} : ${money(v.cur, v.subtotal)} (${money(v.cur, v.unit)} pièce). Livraison : ${v.opts}. ${v.vat}`,
    it: v => `${v.qty} × ${v.product} verso ${v.country}: ${money(v.cur, v.subtotal)} (${money(v.cur, v.unit)} al pezzo). Spedizione: ${v.opts}. ${v.vat}` },
  opt: { fr: o => `${o.label} ${o.free ? "gratuite" : money(o.cur, o.price)} (arrivée ${o.from}–${o.to})`, it: o => `${o.label} ${o.free ? "gratuita" : money(o.cur, o.price)} (arrivo ${o.from}–${o.to})` },
  vatEx: { fr: r => `La TVA (${pct(r)} %) est ajoutée au paiement. Les dates sont des estimations ; la production commence après le paiement et la validation de l'épreuve.`, it: r => `L'IVA (${pct(r)}%) viene aggiunta al checkout. Le date sono stime; la produzione inizia dopo il pagamento e l'approvazione della bozza.` },
  vatIn: { fr: () => "Prix TVA incluse. Les dates sont des estimations ; la production commence après le paiement et la validation de l'épreuve.", it: () => "Prezzi IVA inclusa. Le date sono stime; la produzione inizia dopo il pagamento e l'approvazione della bozza." },
  noShip: { fr: v => `Désolé, nous ne livrons pas encore vers ${v}.`, it: v => `Ci dispiace, non spediamo ancora verso ${v}.` },
  price: { fr: v => `${v.product} : ${v.tiers}. ${v.vat} Personnalisez-le ici : ${v.link}`, it: v => `${v.product}: ${v.tiers}. ${v.vat} Lo personalizzi qui: ${v.link}` },
  tier: { fr: t => `${money(t.currency, t.unit_price)} dès ${t.min_qty}`, it: t => `${money(t.currency, t.unit_price)} da ${t.min_qty}` },
  perItemEx: { fr: "Prix unitaires hors TVA ; livraison et TVA au paiement.", it: "Prezzi unitari IVA esclusa; spedizione e IVA al checkout." },
  reco: { fr: v => `Voici ${v.n} idées${v.budget ? ` jusqu'à ${v.budget} pièce` : ""} : ${v.list}. Touchez une carte pour la personnaliser.`, it: v => `Ecco ${v.n} idee${v.budget ? ` fino a ${v.budget} al pezzo` : ""}: ${v.list}. Tocchi una scheda per personalizzarla.` },
  recoNone: { fr: "Je n'ai rien trouvé dans ce budget. Un budget un peu plus élevé vous conviendrait-il, ou dois-je vous montrer nos articles les plus populaires ?", it: "Non ho trovato prodotti in questo budget. Va bene un budget un po' più alto, oppure le mostro i nostri articoli più popolari?" },
  askOrder: { fr: "Envoyez-moi votre numéro de commande (p. ex. POD-2026-…) et l'e-mail utilisé pour la commande, et je vérifie le statut.", it: "Mi invii il numero d'ordine (es. POD-2026-…) e l'e-mail usata per l'ordine e controllo lo stato." },
  askEmail: { fr: v => `Merci ! Pour votre sécurité, quelle adresse e-mail avez-vous utilisée pour la commande ${v} ?`, it: v => `Grazie! Per sicurezza, quale e-mail ha usato per l'ordine ${v}?` },
  notFound: { fr: "Je ne trouve aucune commande avec ce numéro et cet e-mail. Vérifiez les deux (le numéro figure dans l'e-mail de confirmation) ou utilisez « Retrouver ma commande » : /account#find-order", it: "Non trovo un ordine con questo numero ed e-mail. Controlli entrambi (il numero è nell'e-mail di conferma) oppure usi «Trova il mio ordine»: /account#find-order" },
  tooMany: { fr: "Trop de tentatives pour ce numéro de commande. Réessayez dans 15 minutes.", it: "Troppi tentativi per questo numero d'ordine. Riprovi tra 15 minuti." },
  stage: {
    fr: { awaiting_payment: "attend le paiement", paid: "est payée et en préparation", proof: "attend la validation de votre épreuve", in_production: "est en production", shipped: "a été expédiée", delivered: "a été livrée", cancelled: "a été annulée" },
    it: { awaiting_payment: "è in attesa di pagamento", paid: "è pagato e in preparazione", proof: "attende l'approvazione della bozza", in_production: "è in produzione", shipped: "è stato spedito", delivered: "è stato consegnato", cancelled: "è stato annullato" } },
  order: { fr: v => `La commande ${v.id} ${v.stage}.${v.eta ? ` Livraison estimée : ${v.eta}.` : ""}${v.track ? ` ${v.track}` : ""}`, it: v => `L'ordine ${v.id} ${v.stage}.${v.eta ? ` Consegna stimata: ${v.eta}.` : ""}${v.track ? ` ${v.track}` : ""}` },
  trackLine: { fr: v => `${v.carrier || "Le transporteur"} indique « ${v.status} »${v.last ? ` — dernier événement : ${v.last}` : ""}.${v.url ? ` Suivi : ${v.url}` : ""}`, it: v => `${v.carrier || "Il corriere"} indica «${v.status}»${v.last ? ` — ultimo aggiornamento: ${v.last}` : ""}.${v.url ? ` Tracciamento: ${v.url}` : ""}` },
  askTracking: { fr: "Envoyez-moi le numéro de suivi de l'e-mail d'expédition — ou votre numéro de commande et votre e-mail, et je vérifie.", it: "Mi invii il numero di tracciamento dall'e-mail di spedizione — oppure numero d'ordine ed e-mail e controllo io." },
  trackNotFound: { fr: v => `Je ne trouve pas de colis avec le numéro de suivi ${v}. Vérifiez le numéro (dans l'e-mail d'expédition) ou envoyez votre numéro de commande et votre e-mail.`, it: v => `Non trovo un pacco con il numero di tracciamento ${v}. Controlli il numero (nell'e-mail di spedizione) oppure mi invii numero d'ordine ed e-mail.` },
  trackInvalid: { fr: "Cela ne ressemble pas à un numéro de suivi valide. Copiez-le depuis l'e-mail d'expédition, ou envoyez votre numéro de commande et votre e-mail.", it: "Non sembra un numero di tracciamento valido. Lo copi dall'e-mail di spedizione, oppure mi invii numero d'ordine ed e-mail." },
  discount: {
    fr: v => `${v ? `Les prix dégressifs s'appliquent automatiquement (p. ex. ${v}).` : "Certains produits sont moins chers à la pièce dès 10, 25, 50 ou 100 pièces — le panier affiche toujours votre prix exact."} Si vous avez un code promo, saisissez-le dans le panier ou au paiement — un code par commande. Envoyez-le-moi et je le vérifie.`,
    it: v => `${v ? `Gli sconti quantità si applicano automaticamente (es. ${v}).` : "Alcuni prodotti costano meno al pezzo da 10, 25, 50 o 100 pezzi — il carrello mostra sempre il prezzo esatto."} Se ha un codice sconto, lo inserisca nel carrello o al checkout — un codice per ordine. Me lo invii e lo controllo.` },
  codeOk: { fr: v => `Le code ${v.code} est valable : ${v.value} de réduction${v.min ? `, commande minimum ${v.min}` : ""}${v.exp ? `, valable jusqu'au ${v.exp}` : ""}. Saisissez-le dans le panier ou au paiement.`, it: v => `Il codice ${v.code} è valido: ${v.value} di sconto${v.min ? `, ordine minimo ${v.min}` : ""}${v.exp ? `, valido fino al ${v.exp}` : ""}. Lo inserisca nel carrello o al checkout.` },
  codeBad: { fr: v => `Désolé, le code ${v} n'est pas valable (expiré, épuisé ou inconnu).`, it: v => `Ci dispiace, il codice ${v} non è valido (scaduto, esaurito o sconosciuto).` },
  issued: { fr: v => `Je peux vous proposer un code unique : ${v.code} (${v.value} de réduction, valable jusqu'au ${v.exp}). Saisissez-le au paiement.`, it: v => `Posso offrirle un codice monouso: ${v.code} (${v.value} di sconto, valido fino al ${v.exp}). Lo inserisca al checkout.` },
  product: { fr: v => `${v.name} : ${v.materials ? `matières ${v.materials} ; ` : ""}${v.tiers}. ${v.vat} Personnalisez-le : ${v.link}`, it: v => `${v.name}: ${v.materials ? `materiali ${v.materials}; ` : ""}${v.tiers}. ${v.vat} Lo personalizzi: ${v.link}` },
  offerHuman: { fr: "Si cela ne répond pas entièrement à votre question, je peux la transmettre à notre équipe — écrivez simplement « parler à une personne ».", it: "Se questo non risponde del tutto alla sua domanda, posso passarla al nostro team — scriva semplicemente «parlare con una persona»." },
  unknown: { fr: "Je ne suis pas sûr de pouvoir répondre à cela. Je peux vous aider pour les produits et recommandations, les prix et frais de port, les délais de livraison et le suivi de commande — ou vous mettre en relation avec notre équipe.", it: "Non sono sicuro di poter rispondere. Posso aiutarla con prodotti e consigli, prezzi e spedizione, tempi di consegna e stato dell'ordine — oppure metterla in contatto con il nostro team." },
  muted: { fr: "Votre demande est entre les mains de notre équipe — réponse bientôt. J'ai ajouté votre message.", it: "La sua richiesta è presso il nostro team — risponderà presto. Ho aggiunto il suo messaggio." },
  emailNoted: { fr: "Merci — j'ai ajouté votre e-mail pour que l'équipe puisse répondre.", it: "Grazie — ho aggiunto la sua e-mail così il team può rispondere." },
  rate: { fr: "Vous avez envoyé beaucoup de messages. Patientez un instant.", it: "Ha inviato molti messaggi. Attenda un momento." },
  disabled: { fr: "L'assistant est hors ligne pour le moment. Utilisez « Retrouver ma commande » (/account#find-order) ou réessayez plus tard.", it: "L'assistente è offline al momento. Usi «Trova il mio ordine» (/account#find-order) o riprovi più tardi." }
};

export const CHIPS_FR_IT = {
  fr: ["Livraison en Suisse pour 10 faire-part", "Idées de cadeaux pour les invités", "Quel est le délai de livraison ?", "Suivre ma commande"],
  it: ["Spedizione in Svizzera per 10 inviti", "Idee regalo per gli ospiti", "Quanto tempo richiede la consegna?", "Traccia il mio ordine"]
};
export const PRODUCT_CHIPS_FR_IT = { fr: ["Faire-part", "Cartes de menu", "Marque-places", "Panneau de bienvenue"], it: ["Inviti", "Menù", "Segnaposto", "Cartello di benvenuto"] };
export const COUNTRY_CHIPS_FR_IT = { fr: ["Suisse", "Allemagne", "Autriche", "France"], it: ["Svizzera", "Germania", "Austria", "Francia"] };
export const HUMAN_CHIP_FR_IT = { fr: "Parler à une personne", it: "Parlare con una persona" };
export const COUNTRY_LABEL_FR_IT = {
  fr: { CH: "la Suisse", DE: "l'Allemagne", AT: "l'Autriche", FR: "la France", IT: "l'Italie", LI: "le Liechtenstein", GB: "le Royaume-Uni", US: "les États-Unis" },
  it: { CH: "la Svizzera", DE: "la Germania", AT: "l'Austria", FR: "la Francia", IT: "l'Italia", LI: "il Liechtenstein", GB: "il Regno Unito", US: "gli Stati Uniti" }
};

// ---- Knowledge base (static FAQ) ----
export const FAQ_FR_IT = {
  what_we_sell: { q: { fr: "Que vendez-vous ?", it: "Cosa vendete?" },
    a: { fr: "POD.AI crée de la papeterie de mariage personnalisée et des cadeaux personnalisés : faire-part, cartes save-the-date, menus, marque-places, numéros de table, panneaux de bienvenue, boîtes cadeaux et cadeaux d'invités, ainsi que mugs, t-shirts, sacs et bien plus. Tout est imprimé à la demande.",
         it: "POD.AI realizza cartoleria per matrimoni e regali personalizzati: inviti, save the date, menù, segnaposto, numeri tavolo, cartelli di benvenuto, scatole regalo e bomboniere, oltre a tazze, magliette, borse e molto altro. Tutto è stampato su richiesta." } },
  proof: { q: { fr: "Quand vais-je recevoir mon épreuve ?", it: "Quando ricevo la bozza?" },
    a: { fr: "Pour les créations personnalisées, nous vous envoyons par e-mail un lien vers l'épreuve après le paiement ; la production ne commence qu'après votre validation (ou juste après le paiement si vous validez la maquette au paiement). Vérifiez bien les noms, dates et l'orthographe.",
         it: "Per i design personalizzati le inviamo via e-mail il link alla bozza dopo il pagamento; la produzione inizia solo dopo la sua approvazione (o subito dopo il pagamento se approva il mockup al checkout). Controlli bene nomi, date e ortografia." } },
  returns: { q: { fr: "Puis-je retourner des articles personnalisés ?", it: "Posso restituire articoli personalizzati?" },
    a: { fr: "Les articles personnalisés sont fabriqués selon vos indications et ne peuvent pas être retournés pour simple changement d'avis. Si un article arrive défectueux, endommagé ou différent de l'épreuve validée, contactez-nous sous 14 jours avec le numéro de commande et des photos : nous réimprimons ou remboursons sans frais. Détails (en anglais) : /returns",
         it: "Gli articoli personalizzati sono realizzati su sua indicazione e non possono essere resi per ripensamento. Se un articolo arriva difettoso, danneggiato o diverso dalla bozza approvata, ci contatti entro 14 giorni con numero d'ordine e foto: ristampiamo o rimborsiamo senza costi. Dettagli (in inglese): /returns" } },
  cancel: { q: { fr: "Puis-je modifier ou annuler ma commande ?", it: "Posso modificare o annullare l'ordine?" },
    a: { fr: "Vous pouvez modifier ou annuler gratuitement jusqu'au début de la production, c'est-à-dire jusqu'à la validation de votre épreuve (ou juste après le paiement si vous avez validé la maquette au paiement). Ensuite, l'annulation n'est plus possible.",
         it: "Può modificare o annullare gratuitamente fino all'inizio della produzione, cioè fino all'approvazione della bozza (o subito dopo il pagamento se ha approvato il mockup al checkout). Dopo non è più possibile annullare." } },
  customs: { q: { fr: "Dois-je payer des droits de douane ou la TVA à l'importation ?", it: "Devo pagare dazi o IVA all'importazione?" },
    a: { fr: "Les articles sont fabriqués à la commande et expédiés depuis la Chine via YunExpress ou 4PX. La TVA à l'importation et le dédouanement peuvent s'appliquer ; le paiement affiche la TVA de votre pays de livraison, et les autres droits ou frais de dédouanement sont à la charge du destinataire à la livraison. Détails : /shipping",
         it: "Gli articoli sono prodotti su ordinazione e spediti dalla Cina con YunExpress o 4PX. Possono applicarsi IVA all'importazione e sdoganamento; il checkout mostra l'IVA del paese di consegna, mentre altri dazi o spese di sdoganamento sono a carico del destinatario alla consegna. Dettagli: /shipping" } },
  website: { q: { fr: "Puis-je créer un site de mariage ?", it: "Posso creare un sito per il matrimonio?" },
    a: { fr: "Oui — cliquez sur « Create wedding website » dans le menu. La création est gratuite ; vos invités peuvent le consulter en anglais, chinois ou allemand et vous pouvez recueillir les RSVP.",
         it: "Sì — clicchi su «Create wedding website» nel menu. La creazione è gratuita; gli ospiti possono vederlo in inglese, cinese o tedesco e può raccogliere gli RSVP." } },
  design: { q: { fr: "Comment commencer ma création ?", it: "Come inizio a creare il design?" },
    a: { fr: "Cliquez sur « Start designing » pour ouvrir le studio, choisissez un produit et ajoutez noms, date, texte ou importez votre propre fichier (PNG, JPG, SVG, PDF…). Le prix se met à jour en direct.",
         it: "Clicchi su «Start designing» per aprire lo studio, scelga un prodotto e aggiunga nomi, data, testo oppure carichi il suo file (PNG, JPG, SVG, PDF…). Il prezzo si aggiorna in tempo reale." } },
  samples: { q: { fr: "Proposez-vous des échantillons ?", it: "Offrite campioni?" },
    a: { fr: "Tous les produits peuvent être commandés dès 1 pièce : une seule pièce sert d'échantillon avant une plus grande commande.", it: "Tutti i prodotti si possono ordinare da 1 pezzo: un singolo pezzo fa da campione prima di un ordine più grande." } },
  eco: { q: { fr: "Vos produits sont-ils durables ?", it: "I vostri prodotti sono sostenibili?" },
    a: { fr: "De nombreux produits papier utilisent du papier FSC ou recyclé ; tout est fabriqué à la commande et expédié depuis la Chine via YunExpress ou 4PX. Repérez le label Eco dans la liste des produits.", it: "Molti prodotti in carta usano carta FSC o riciclata; tutto è prodotto su ordinazione e spedito dalla Cina con YunExpress o 4PX. Cerchi l'etichetta Eco nell'elenco prodotti." } },
  contact: { q: { fr: "Comment joindre une personne ?", it: "Come contatto una persona?" },
    a: { fr: "Demandez simplement ici à parler à une personne et laissez votre e-mail — je transmets la conversation à notre équipe, qui répond sous 24 heures (lun–ven).", it: "Chieda qui di parlare con una persona e lasci la sua e-mail — passo la chat al nostro team, che risponde entro 24 ore (lun–ven)." } }
};

// ---- Knowledge base (entries built from live shop facts) ----
export function dynamicFrIt(f) {
  const vat = f.prices_include_vat, free = f.free_standard_shipping_over, methods = f.payment_methods.join(", ");
  const freeFr = [free.CHF ? `CHF ${free.CHF.toFixed(2)} en Suisse` : "", free.EUR ? `EUR ${free.EUR.toFixed(2)} vers l'Allemagne` : ""].filter(Boolean).join(" et ");
  const freeIt = [free.CHF ? `CHF ${free.CHF.toFixed(2)} in Svizzera` : "", free.EUR ? `EUR ${free.EUR.toFixed(2)} verso la Germania` : ""].filter(Boolean).join(" e ");
  return {
    delivery_time: { q: { fr: "Quel est le délai de livraison ?", it: "Quanto tempo richiede la consegna?" },
      a: { fr: `La livraison prend environ ${f.delivery_days} jours ouvrables vers toutes les régions (Suisse, UE et monde) : environ ${f.production_days.CH} jours ouvrables de production (à la commande) plus le transport international depuis la Chine via YunExpress ou 4PX, et environ ${f.proof_buffer_days} jours de plus si vous validez d'abord une épreuve. Vos dates exactes s'affichent dans le panier et au paiement avant de payer, et vous recevez un numéro de suivi dès l'expédition du colis.`,
           it: `La consegna richiede circa ${f.delivery_days} giorni lavorativi verso tutte le regioni (Svizzera, UE e resto del mondo): circa ${f.production_days.CH} giorni lavorativi di produzione (su ordinazione) più il trasporto internazionale dalla Cina con YunExpress o 4PX, e circa ${f.proof_buffer_days} giorni in più se approva prima una bozza. Le date esatte sono mostrate nel carrello e al checkout prima del pagamento, e riceve un numero di tracciamento appena il pacco parte.` } },
    vat: { q: { fr: "Les prix incluent-ils la TVA ?", it: "I prezzi includono l'IVA?" },
      a: vat ? { fr: "Les prix incluent la TVA de votre pays de livraison ; la part de TVA est indiquée au paiement.", it: "I prezzi includono l'IVA del paese di consegna; la quota IVA è indicata al checkout." }
             : { fr: "Les prix des produits sont affichés hors TVA ; la TVA de votre pays de livraison (p. ex. 8,1 % en Suisse) est ajoutée au paiement.", it: "I prezzi dei prodotti sono IVA esclusa; l'IVA del paese di consegna (es. 8,1% in Svizzera) viene aggiunta al checkout." } },
    payment: { q: { fr: "Quels moyens de paiement acceptez-vous ?", it: "Quali metodi di pagamento accettate?" },
      a: { fr: `Nous acceptons ${methods.replace("(incl. cards)", "(cartes incluses)")} — le paiement par carte via PayPal fonctionne aussi sans compte PayPal. Le paiement se fait uniquement au checkout sécurisé — n'envoyez jamais de données de carte dans le chat.`, it: `Accettiamo ${methods.replace("(incl. cards)", "(carte incluse)")} — si può pagare con carta tramite PayPal anche senza account PayPal. Il pagamento avviene solo nel checkout sicuro — non invii mai dati della carta nella chat.` } },
    free_shipping: { q: { fr: "La livraison est-elle gratuite ?", it: "La spedizione è gratuita?" },
      a: (free.CHF || free.EUR) ? { fr: `La livraison standard est gratuite dès ${freeFr} (montant des articles). L'express est toujours payant.`, it: `La spedizione standard è gratuita da ${freeIt} (valore della merce). L'espresso è sempre a pagamento.` }
                                : { fr: "Les frais de port sont calculés dans le panier selon votre adresse.", it: "Le spese di spedizione sono calcolate nel carrello in base all'indirizzo." } }
  };
}
