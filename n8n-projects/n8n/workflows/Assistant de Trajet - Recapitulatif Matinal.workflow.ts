const declenchement_Matinal = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Declenchement Matinal', parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 9 * * 1-5' }] } }, position: [0, 96], notes: 'Declenche le recapitulatif du lundi au vendredi a 11h30 heure de Paris (9h30 UTC), soit environ 1h30 avant le depart habituel de 13h00 pour laisser le temps de partir plus tot si necessaire.', notesInFlow: true }
});

const parametres_du_Trajet = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Parametres du Trajet', parameters: { mode: 'manual', includeOtherFields: false, assignments: { assignments: [{ id: 'a1', name: 'adresseDepart', value: '20 place des Quatre Saisons, 91270 Vigneux-sur-Seine', type: 'string' }, { id: 'a2', name: 'lonDepart', value: 2.439973, type: 'number' }, { id: 'a3', name: 'latDepart', value: 48.690073, type: 'number' }, { id: 'a4', name: 'gare', value: 'Montgeron-Crosne', type: 'string' }, { id: 'a5', name: 'lonGare', value: 2.462302, type: 'number' }, { id: 'a6', name: 'latGare', value: 48.7081, type: 'number' }, { id: 'a7', name: 'destination', value: '10 rue de Paradis, 75010 Paris', type: 'string' }, { id: 'a8', name: 'lonDestination', value: 2.354329, type: 'number' }, { id: 'a9', name: 'latDestination', value: 48.874639, type: 'number' }, { id: 'a10', name: 'rerLigne', value: 'RER D', type: 'string' }, { id: 'a11', name: 'metroLigne', value: 'Ligne 5', type: 'string' }, { id: 'a12', name: 'heureDepartHabituelle', value: '13:00', type: 'string' }, { id: 'a13', name: 'dureeVoitureHabituelleMin', value: 10, type: 'number' }, { id: 'a14', name: 'seuilPerturbationMin', value: 10, type: 'number' }, { id: 'a15', name: 'emailDestinataire', value: 'efernandes@eugeniaschool.com', type: 'string' }, { id: 'a16', name: 'latitudeMeteo', value: 48.690073, type: 'number' }, { id: 'a17', name: 'longitudeMeteo', value: 2.439973, type: 'number' }] } }, position: [272, 416], notes: 'Tous les reglages du trajet se modifient ici. Coordonnees au format lon,lat.', notesInFlow: true }
});

const fusion_Donnees = merge({
  version: 3.2,
  config: { name: 'Fusion Donnees', parameters: { mode: 'combine', combineBy: 'combineByPosition', numberInputs: 3, options: {} }, position: [720, 400] }
});

const trafic_Voiture = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Trafic Voiture', parameters: { method: 'GET', url: '{{ "https://router.project-osrm.org/route/v1/driving/" + $json.lonDepart + "," + $json.latDepart + ";" + $json.lonGare + "," + $json.latGare + "?overview=false" }}', options: { response: { response: { responseFormat: 'json', neverError: true, timeout: 20000 } } } }, position: [496, 224], notes: 'Duree de trajet voiture domicile vers gare via OSRM, gratuit et sans cle. Attention : OSRM ne fournit pas de trafic en temps reel, uniquement la duree theorique du parcours. Le reflet du trafic se fait par comparaison avec dureeVoitureHabituelleMin, donc une perturbation ne sera detectee que de facon indirecte.', notesInFlow: true }
});

const transports_Publics = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Transports Publics', parameters: { method: 'GET', url: '{{ "https://router.project-osrm.org/route/v1/walking/" + $json.lonGare + "," + $json.latGare + ";" + $json.lonDestination + "," + $json.latDestination + "?overview=false" }}', options: { response: { response: { responseFormat: 'json', neverError: true, timeout: 20000 } } } }, position: [496, 416], notes: 'Duree du trajet gare vers destination via OSRM, gratuit et sans cle. ATTENTION : le profil walking calcule un trajet a pied, pas en RER ou metro. Cette valeur ne remplace donc pas les horaires de transport en commun et ne detecte aucun retard de ligne. Elle est purely informative.', notesInFlow: true }
});

const meteo_Temperature = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Meteo Temperature', parameters: { url: expr('{{ "https://api.open-meteo.com/v1/forecast?latitude=" + $json.latitudeMeteo + "&longitude=" + $json.longitudeMeteo + "&current=temperature_2m" }}'), options: { response: { response: { neverError: true, responseFormat: 'json' } } } }, position: [496, 608], notes: 'Temperature via Open-Meteo, gratuit et sans cle. Purement informative, n influence jamais la recommandation.', notesInFlow: true }
});

const analyse_Trajet = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Analyse Trajet', parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: 'const cfg = $(\'Parametres du Trajet\').first().json;\nconst carBody = $(\'Trafic Voiture\').first().json || {};\nconst transitBody = $(\'Transports Publics\').first().json || {};\nconst weatherBody = $(\'Meteo Temperature\').first().json || {};\n\nconst seuil = Number(cfg.seuilPerturbationMin) || 10;\nconst baselineVoiture = Number(cfg.dureeVoitureHabituelleMin) || null;\n\nconst voiture = { disponible: false, minutes: null, delta: null, fiable: false, incoherent: false };\nconst carRoutes = carBody && Array.isArray(carBody.routes) ? carBody.routes : [];\nif (carRoutes.length > 0 && carBody.code === \'Ok\') {\n  const minutes = Math.round((Number(carRoutes[0].duration) || 0) / 60);\n  if (minutes > 0) {\n    voiture.disponible = true;\n    voiture.minutes = minutes;\n    if (baselineVoiture) {\n      voiture.delta = minutes - baselineVoiture;\n      voiture.incoherent = minutes > baselineVoiture * 3 || minutes < baselineVoiture * 0.4;\n      voiture.fiable = !voiture.incoherent;\n    } else {\n      voiture.fiable = true;\n    }\n  }\n}\n\nconst transitRoutes = transitBody && Array.isArray(transitBody.routes) ? transitBody.routes : [];\nconst pietonMinutes = transitRoutes.length > 0 && transitBody.code === \'Ok\'\n  ? Math.round((Number(transitRoutes[0].duration) || 0) / 60)\n  : null;\n\nconst temperature = weatherBody && weatherBody.current ? Math.round(Number(weatherBody.current.temperature_2m)) : null;\n\nlet retardTotal = 0;\nconst motifs = [];\nif (voiture.fiable && voiture.delta !== null && voiture.delta > 0) {\n  retardTotal += voiture.delta;\n  motifs.push(\'Trajet voiture plus long que d\'habitude : +\' + voiture.delta + \' min\');\n}\n\nconst perturbation = retardTotal >= seuil;\nconst risque = retardTotal === 0 ? \'faible\' : (retardTotal < 20 ? \'moyen\' : \'eleve\');\n\nlet heureConsillee = null;\nif (perturbation) {\n  const p = String(cfg.heureDepartHabituelle || \'13:00\').split(\':\');\n  const base = (Number(p[0]) || 13) * 60 + (Number(p[1]) || 0) - retardTotal;\n  const arr = Math.ceil(Math.max(0, base) / 5) * 5;\n  const h = Math.floor(arr / 60);\n  const m = arr % 60;\n  heureConsillee = (h < 10 ? \'0\' + h : String(h)) + \'h\' + (m < 10 ? \'0\' + m : String(m));\n}\n\nconst bloqueVoiture = voiture.disponible && !voiture.fiable;\nconst sourcesFiables = voiture.fiable;\n\nconst L = [];\nL.push(\'Trajet du matin\');\nL.push(\'\');\nL.push(\'Voiture vers \' + cfg.gare);\nif (voiture.disponible && voiture.fiable) {\n  L.push(voiture.minutes + \' min\' + (voiture.delta !== null && voiture.delta !== 0 ? \' (\' + (voiture.delta > 0 ? \'+\' : \'\') + voiture.delta + \' min vs habituel)\' : \'\'));\n  L.push(voiture.delta !== null && voiture.delta >= 5 ? \'Trafic plus dense que d\'habitude\' : \'Trafic normal\');\n} else if (bloqueVoiture) {\n  L.push(\'Donnee incoherente, non utilisee\');\n} else {\n  L.push(\'Donnees indisponibles\');\n}\nL.push(\'\');\nL.push(cfg.rerLigne + \' / \' + cfg.metroLigne + \' : retards non disponibles\');\nL.push(pietonMinutes !== null ? \'Trajet a pied de reference (gare vers destination) : \' + pietonMinutes + \' min\' : \'Trajet pieton : donnees indisponibles\');\nL.push(\'\');\nL.push(temperature !== null ? \'Temperature : \' + temperature + \' C\' : \'Temperature : indisponible\');\nL.push(\'\');\nif (perturbation) {\n  L.push(risque === \'moyen\' ? \'Risque moyen\' : \'Risque eleve\');\n  L.push(\'Depart conseille : \' + heureConsillee);\n  L.push(\'\');\n  for (const m of motifs) L.push(\'- \' + m);\n} else {\n  L.push(\'Trajet normal, aucun retard significatif detecte\');\n}\nL.push(\'\');\nL.push(\'(Retards RER et metro non disponibles : source temps reel necessitant un acces API non obtenu.)\');\n\nreturn [{ json: { message: L.join(\'\\n\'), perturbation: perturbation, risque: risque, retardTotal: retardTotal, heureConsillee: heureConsillee, temperature: temperature, donneesFiables: sourcesFiables, motifs: motifs, pietonMinutes: pietonMinutes } }];' }, position: [944, 400], notes: 'Consolide les reponses OSRM et Open-Meteo. Detecte une donnee voiture incoherente, construit le recapitulatif et signale explicitement que les retards de transport en commun ne sont pas disponibles.', notesInFlow: true }
});

const donnees_Fiables = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Donnees Fiables ?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('{{ $json.donneesFiables }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, position: [1168, 224], notes: 'Spec 7.3 : si aucune donnee fiable, aucune notification. La meteo seule ne compte plus comme source fiable, sinon un mail sans aucune donnee de trajet partirait quand meme.', notesInFlow: true }
});

const envoyer_Recapitulatif = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Envoyer Recapitulatif', parameters: { sendTo: expr('{{ $("Parametres du Trajet").first().json.emailDestinataire }}'), subject: expr('{{ "Trajet du matin - " + ($json.perturbation ? "perturbation detectee" : "trajet normal") }}'), emailType: 'text', message: expr('{{ $json.message }}'), options: { appendAttribution: false } }, credentials: { gmailOAuth2: newCredential('Gmail account', '80u9cDgullboEIRf') }, position: [1424, 0], webhookId: '54b671ab-cf54-4f81-b03c-d6467a22a9ed', notes: 'Envoi du recapitulatif par email, format texte court.', notesInFlow: true }
});

const aucune_Donnee_Fiable = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Aucune Donnee Fiable', parameters: { assignments: { assignments: [{ id: 'n1', name: 'raison', value: 'Aucune source fiable, aucun envoi (spec 7.3)', type: 'string' }] }, includeOtherFields: true, options: {} }, position: [1424, 192], notes: 'Fin du workflow sans notification.', notesInFlow: true }
});

const wf = workflow('rqDxQgeCC393cbRI', 'Assistant de Trajet - Recapitulatif Matinal', { executionOrder: 'v1', availableInMCP: true, binaryMode: 'separate' });

export default wf
  .add(declenchement_Matinal)
  .to(parametres_du_Trajet
  .to([
    trafic_Voiture,
    transports_Publics,
    meteo_Temperature]))
  .add(sticky('## Sources de donnees\n\nToutes les sources sont **gratuites et sans cle**.\n\n- **Voiture** : OSRM `router.project-osrm.org`, profil `driving`\n- **Gare vers destination** : OSRM, profil `walking`\n- **Meteo** : Open-Meteo `api.open-meteo.com`\n\n## Ce qui a change\n\nLa version precedente utilisait Navitia, qui exigeait un token. Le service gratuit navitia.io est **cloture depuis octobre 2024** (Hove, 5000 EUR HT/an), et l\'acces gratuit distribue par Ile-de-France Mobilites via PRIM n\'etait pas encore actif sur le compte. D\'ou le remplacement par OSRM.\n\n## Ce que cela ne detecte pas\n\n- **Pas de trafic temps reel** : OSRM ne renvoie que la duree theorique du parcours. Une perturbation se deduit seulement de l\'ecart avec la duree habituelle.\n- **Pas de retards de transport en commun** : le profil `walking` calcule un trajet a pied, pas en RER ou metro. Le mail l\'indique explicitement.\n- Si tu veux retrouver les retards par ligne, il faudra l\'acces PRIM valide, puis retablir l\'appel Navitia.', [], { name: 'Sticky Note cb59a357', color: 2, width: 520, height: 700, position: [880, 880] }))
  .add(sticky('## Regles appliquees\n\n- Perturbation = retard total >= 10 min (3.3)\n- Donnee incoherente (3x le temps habituel) ecartee, exclue de la recommandation (7.2)\n- La temperature est affichee mais n influence jamais la recommandation (3.4)\n- **Aucune source fiable = aucun envoi (7.3)** : seule la voiture compte comme source fiable, la meteo ne suffit plus\n- L\'heure de declenchement est passee de 12h30 UTC a 9h30 UTC pour tomber vers 11h30 heure de Paris, avant le depart de 13h00', [], { name: 'Sticky Note 74bb8b4e', color: 4, position: [576, 864] }))
  .add(trafic_Voiture.to(fusion_Donnees.input(0)))
  .add(transports_Publics.to(fusion_Donnees.input(1)))
  .add(meteo_Temperature.to(fusion_Donnees.input(2)))
  .add(fusion_Donnees)
  .to(analyse_Trajet
  .to(donnees_Fiables.onTrue(envoyer_Recapitulatif).onFalse(aucune_Donnee_Fiable)))