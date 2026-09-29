/* Bewerbungslotse – statische Daten (ohne KI, offline nutzbar)
   Alles hier ist bewusst einfach erweiterbar: Einträge ergänzen, fertig. */
'use strict';

/* Kompetenz-Wörterbuch: Kategorie -> Begriffe (klein geschrieben, Synonyme mit | getrennt) */
window.SKILLS = {
  'IT & Software': ['javascript|js','typescript','python','java$','c#|c sharp','c++','php','sql','html','css','react','angular','vue','node.js|nodejs','docker','kubernetes','linux','windows server','active directory','netzwerktechnik|netzwerk','cloud|aws|azure|gcp','sap','sap s/4hana|s/4hana','git','scrum','agile|agil','itil','it-support|first level|second level','datenbanken|datenbank','excel$','power bi','cad','autocad','solidworks','ms office|microsoft office|office 365|m365','erp','crm','salesforce','datev','wordpress','seo','cybersecurity|it-sicherheit','programmierung|softwareentwicklung','testautomatisierung|testing'],
  'Technik & Handwerk': ['elektrotechnik|elektrik','elektroinstallation','sps|speicherprogrammierbare steuerung','siemens s7|tia portal','mechatronik','schweißen|schweissen','cnc','drehen','fräsen','montage','wartung|instandhaltung','hydraulik','pneumatik','haustechnik','shk|sanitär|heizung|klima','photovoltaik|pv','kfz|kfz-mechatronik','lackieren','schreiner|tischler','maurer','trockenbau','fliesen','dachdecker','metallbau','messtechnik','qualitätssicherung|qualitätskontrolle','technische zeichnung|zeichnungen lesen','staplerschein|gabelstapler','kranschein','schichtarbeit'],
  'Pflege & Gesundheit': ['pflege$|krankenpflege|pflegekraft','altenpflege','grundpflege','behandlungspflege','intensivpflege','medizinische fachangestellte|mfa','zahnmedizinische fachangestellte|zfa','wundversorgung','dokumentation','physiotherapie','ergotherapie','erste hilfe','hygiene','medikamentengabe','betreuung','heilerziehungspflege','notfallsanitäter|rettungsdienst'],
  'Büro & Verwaltung': ['buchhaltung','finanzbuchhaltung','lohnbuchhaltung|lohnabrechnung','controlling','rechnungswesen','steuern','personalwesen|hr','recruiting','sachbearbeitung','kundenservice|kundenbetreuung','telefonie','korrespondenz','terminplanung','assistenz','empfang','einkauf','beschaffung','projektmanagement','office management','ablage','datenpflege','reisekostenabrechnung','mahnwesen','vertragsmanagement'],
  'Vertrieb & Marketing': ['vertrieb|verkauf','außendienst|aussendienst','innendienst','key account|key-account','akquise|neukundengewinnung','verhandlung','marketing','online marketing|digital marketing','social media','content$','kampagnen','e-commerce|onlinehandel','einzelhandel','kassieren|kasse','warenpräsentation','beratung'],
  'Logistik & Transport': ['logistik','lager|lagerlogistik','kommissionierung','versand','wareneingang','warenausgang','disposition','supply chain','führerschein klasse b|führerschein b','führerschein klasse c|führerschein c|lkw','führerschein ce|klasse ce','berufskraftfahrer','fahrerkarte','adr|gefahrgut','zoll','tourenplanung'],
  'Gastronomie & Hotel': ['koch$|köchin|küche','service$','gastronomie','hotel|hotellerie','rezeption','barista','catering','haccp','housekeeping','systemgastronomie'],
  'Pädagogik & Soziales': ['erzieher|erzieherin|kita','pädagogik','sozialarbeit|soziale arbeit','jugendhilfe','schulbegleitung','inklusion','elternarbeit','unterricht|lehre','nachhilfe','beratungsgespräche'],
  'Sprachen': ['deutsch$|deutschkenntnisse','englisch','französisch','spanisch','italienisch','russisch','polnisch','türkisch','arabisch','ukrainisch','niederländisch'],
  'Soft Skills': ['teamfähigkeit|teamfähig|teamarbeit','kommunikation|kommunikationsstark','zuverlässigkeit|zuverlässig','belastbarkeit|belastbar','selbstständig|selbständig|eigenverantwortlich','flexibilität|flexibel','führung|führungserfahrung|teamleitung','organisation|organisationstalent','kundenorientierung|kundenorientiert','problemlösung','sorgfalt|sorgfältig','pünktlichkeit|pünktlich','lernbereitschaft','durchsetzungsvermögen','empathie|einfühlungsvermögen']
};

/* Berufe mit Schlüsselbegriffen (für Vorschläge ohne KI). Format: [Berufsbezeichnung, 'begriffe', 'verwandte Bezeichnungen'] */
window.OCCUPATIONS = [
  ['Softwareentwickler/in','javascript typescript python java c# php programmierung softwareentwicklung git react node','Web-Entwickler/in; Fullstack-Entwickler/in; Anwendungsentwickler/in'],
  ['Fachinformatiker/in Systemintegration','linux windows server netzwerk active directory it-support cloud docker','IT-Administrator/in; Systemadministrator/in; Netzwerkadministrator/in'],
  ['IT-Support-Mitarbeiter/in','it-support first level second level windows ms office kundenservice','Helpdesk-Mitarbeiter/in; IT-Servicetechniker/in'],
  ['Datenanalyst/in','sql python excel power bi datenbanken controlling','Data Analyst; BI-Analyst/in'],
  ['SAP-Berater/in','sap s/4hana erp','ERP-Berater/in; SAP-Anwendungsbetreuer/in'],
  ['Elektroniker/in Energie- und Gebäudetechnik','elektrotechnik elektroinstallation photovoltaik haustechnik','Elektriker/in; Elektroinstallateur/in'],
  ['Elektroniker/in Automatisierungstechnik','sps siemens s7 tia portal elektrotechnik mechatronik','Automatisierungstechniker/in; SPS-Programmierer/in'],
  ['Mechatroniker/in','mechatronik hydraulik pneumatik wartung sps elektrotechnik','Servicetechniker/in; Instandhalter/in'],
  ['Industriemechaniker/in','wartung instandhaltung montage hydraulik pneumatik drehen fräsen','Maschinenschlosser/in; Instandhaltungsmechaniker/in'],
  ['Zerspanungsmechaniker/in','cnc drehen fräsen technische zeichnung messtechnik','CNC-Fräser/in; CNC-Dreher/in; CNC-Maschinenbediener/in'],
  ['Konstruktionsmechaniker/in','schweißen metallbau montage technische zeichnung','Schweißer/in; Metallbauer/in'],
  ['Anlagenmechaniker/in SHK','shk sanitär heizung klima haustechnik wartung','Heizungsbauer/in; Installateur/in'],
  ['Kfz-Mechatroniker/in','kfz wartung elektrotechnik','Kfz-Mechaniker/in; Kfz-Servicetechniker/in'],
  ['Tischler/in','schreiner tischler montage cad','Schreiner/in; Möbelmonteur/in'],
  ['Technische/r Zeichner/in','cad autocad solidworks technische zeichnung','Technische/r Produktdesigner/in; CAD-Konstrukteur/in'],
  ['Qualitätsprüfer/in','qualitätssicherung messtechnik dokumentation sorgfalt','Qualitätsmanager/in; QS-Mitarbeiter/in'],
  ['Produktionshelfer/in','montage schichtarbeit staplerschein','Maschinenbediener/in; Produktionsmitarbeiter/in'],
  ['Pflegefachfrau/Pflegefachmann','pflege krankenpflege behandlungspflege grundpflege medikamentengabe wundversorgung dokumentation','Gesundheits- und Krankenpfleger/in; Pflegefachkraft'],
  ['Altenpfleger/in','altenpflege grundpflege behandlungspflege betreuung dokumentation','Pflegefachkraft Altenhilfe'],
  ['Pflegehelfer/in','grundpflege betreuung hygiene','Pflegeassistent/in; Betreuungskraft'],
  ['Medizinische/r Fachangestellte/r','medizinische fachangestellte mfa terminplanung empfang hygiene','Arzthelfer/in; Praxisassistenz'],
  ['Zahnmedizinische/r Fachangestellte/r','zahnmedizinische fachangestellte zfa hygiene empfang','Zahnarzthelfer/in'],
  ['Physiotherapeut/in','physiotherapie','Krankengymnast/in'],
  ['Notfallsanitäter/in','notfallsanitäter rettungsdienst erste hilfe','Rettungssanitäter/in'],
  ['Kaufmann/Kauffrau für Büromanagement','sachbearbeitung korrespondenz ms office ablage terminplanung assistenz','Bürokaufmann/-frau; Verwaltungsangestellte/r; Sachbearbeiter/in'],
  ['Buchhalter/in','buchhaltung finanzbuchhaltung datev rechnungswesen mahnwesen','Finanzbuchhalter/in; Bilanzbuchhalter/in'],
  ['Lohn- und Gehaltsbuchhalter/in','lohnbuchhaltung lohnabrechnung datev personalwesen','Entgeltabrechner/in; Payroll Specialist'],
  ['Personalreferent/in','personalwesen hr recruiting vertragsmanagement','HR-Generalist/in; Recruiter/in'],
  ['Controller/in','controlling excel sap power bi rechnungswesen','Financial Controller; Kostenrechner/in'],
  ['Steuerfachangestellte/r','steuern datev buchhaltung','Steuerfachwirt/in'],
  ['Teamassistent/in','assistenz terminplanung korrespondenz ms office office management','Office Manager/in; Sekretär/in'],
  ['Kundenservice-Mitarbeiter/in','kundenservice telefonie kundenorientierung crm beratung','Callcenter-Agent/in; Kundenberater/in'],
  ['Einkäufer/in','einkauf beschaffung verhandlung sap erp','Beschaffungsmanager/in; Supply-Chain-Manager/in'],
  ['Projektmanager/in','projektmanagement scrum agile führung organisation','Projektleiter/in; Projektkoordinator/in'],
  ['Vertriebsmitarbeiter/in Außendienst','vertrieb außendienst akquise verhandlung key account führerschein klasse b','Account Manager/in; Gebietsverkaufsleiter/in'],
  ['Vertriebsinnendienst','innendienst vertrieb kundenservice crm sap','Vertriebsassistent/in; Sales Support'],
  ['Online-Marketing-Manager/in','online marketing seo social media content kampagnen e-commerce','Social-Media-Manager/in; Performance-Marketing-Manager/in'],
  ['Verkäufer/in Einzelhandel','einzelhandel verkauf kasse warenpräsentation beratung','Kaufmann/-frau im Einzelhandel; Kassierer/in'],
  ['Fachkraft für Lagerlogistik','lager lagerlogistik kommissionierung wareneingang warenausgang staplerschein versand','Lagermitarbeiter/in; Fachlagerist/in'],
  ['Kommissionierer/in','kommissionierung lager staplerschein schichtarbeit','Lagerhelfer/in; Picker/in'],
  ['Disponent/in','disposition tourenplanung logistik supply chain','Speditionskaufmann/-frau; Logistikkoordinator/in'],
  ['Berufskraftfahrer/in','berufskraftfahrer führerschein klasse c führerschein ce fahrerkarte adr','Lkw-Fahrer/in; Kraftfahrer/in'],
  ['Kurierfahrer/in','führerschein klasse b tourenplanung versand','Auslieferungsfahrer/in; Paketzusteller/in'],
  ['Koch/Köchin','koch küche haccp gastronomie catering','Beikoch/-köchin; Küchenhilfe'],
  ['Servicekraft Gastronomie','service gastronomie kasse barista','Kellner/in; Restaurantfachmann/-frau'],
  ['Hotelfachmann/-frau','hotel rezeption housekeeping service','Rezeptionist/in; Front Office Agent'],
  ['Erzieher/in','erzieher kita pädagogik elternarbeit inklusion','Pädagogische Fachkraft; Kinderpfleger/in'],
  ['Sozialarbeiter/in','sozialarbeit jugendhilfe beratungsgespräche','Sozialpädagoge/-pädagogin'],
  ['Schulbegleiter/in','schulbegleitung inklusion betreuung','Integrationshelfer/in'],
  ['Reinigungskraft','hygiene sorgfalt zuverlässigkeit','Gebäudereiniger/in; Raumpfleger/in'],
  ['Hausmeister/in','haustechnik wartung elektrotechnik führerschein klasse b','Facility-Mitarbeiter/in; Objektbetreuer/in'],
  ['Sicherheitsmitarbeiter/in','schichtarbeit zuverlässigkeit','Security; Objektschützer/in']
];

/* Vorlagen für Anschreiben (ohne KI). Platzhalter in {geschweiften Klammern}. */
window.TEMPLATES = {
  standard: {
    name: 'Standard (klassisch)',
    text: `Bewerbung als {stelle}{refnr_text}

Sehr geehrte{anrede_ansprechpartner},

mit großem Interesse habe ich Ihre Stellenanzeige als {stelle} gelesen. {einstieg_satz}

{erfahrung_satz} {skills_satz}

{arbeitgeber_satz} Ich arbeite {softskills} und bringe die Bereitschaft mit, mich schnell in neue Aufgaben einzuarbeiten.

{verfuegbarkeit_satz} Über die Einladung zu einem persönlichen Gespräch freue ich mich sehr.

Mit freundlichen Grüßen

{name}`
  },
  kurz: {
    name: 'Kurz (E-Mail / Kurzbewerbung)',
    text: `Bewerbung als {stelle}{refnr_text}

Guten Tag{anrede_kurz},

hiermit bewerbe ich mich als {stelle} bei {arbeitgeber}. {erfahrung_satz} {skills_satz}

Meinen Lebenslauf finden Sie im Anhang. {verfuegbarkeit_satz}

Ich freue mich auf Ihre Rückmeldung.

Viele Grüße
{name}
{telefon}`
  },
  quereinstieg: {
    name: 'Quereinstieg',
    text: `Bewerbung als {stelle}{refnr_text}

Sehr geehrte{anrede_ansprechpartner},

ich möchte mich beruflich neu ausrichten und bewerbe mich daher als {stelle} bei {arbeitgeber}.

{erfahrung_satz} Viele meiner Fähigkeiten lassen sich direkt übertragen: {skills_liste}.

Ich bin motiviert, Neues zu lernen, und arbeite {softskills}. {verfuegbarkeit_satz}

Gern überzeuge ich Sie in einem persönlichen Gespräch.

Mit freundlichen Grüßen

{name}`
  },
  ausbildung: {
    name: 'Ausbildung / duales Studium',
    text: `Bewerbung um einen Ausbildungsplatz als {ausbildung_ziel}{refnr_text}

Sehr geehrte{anrede_ansprechpartner},

in Ihrer Anzeige habe ich gelesen, dass Sie einen Ausbildungsplatz als {ausbildung_ziel} anbieten. Genau in diesem Beruf möchte ich meine Ausbildung machen.

{schule_satz} {praktikum_satz}

{skills_satz} Ich bin {softskills} und lerne gern Neues dazu.

{arbeitgeber_satz} {verfuegbarkeit_satz} Über eine Einladung zu einem Vorstellungsgespräch oder einem Probetag freue ich mich.

Mit freundlichen Grüßen

{name}`
  },
  praktikum: {
    name: 'Praktikum / Trainee',
    text: `Bewerbung um ein Praktikum: {stelle}{refnr_text}

Sehr geehrte{anrede_ansprechpartner},

über Ihre Ausschreibung bin ich auf das Praktikum als {stelle} aufmerksam geworden. Ich möchte den Beruf in der Praxis kennenlernen und dabei mitarbeiten.

{schule_satz} {praktikum_satz} {skills_satz}

Ich arbeite {softskills}. {verfuegbarkeit_satz}

Ich freue mich auf Ihre Rückmeldung.

Mit freundlichen Grüßen

{name}`
  },
  initiativ: {
    name: 'Initiativbewerbung',
    text: `Initiativbewerbung als {stelle}

Sehr geehrte Damen und Herren,

{arbeitgeber} hat mich als Arbeitgeber überzeugt, daher bewerbe ich mich initiativ als {stelle}.

{erfahrung_satz} {skills_satz}

{verfuegbarkeit_satz} Ich freue mich, wenn Sie mich zu einem Gespräch einladen.

Mit freundlichen Grüßen

{name}`
  }
};

/* Links zu weiteren Portalen – es werden nur Such-Links geöffnet, keine Daten automatisch abgerufen */
window.PORTAL_LINKS = [
  ['Jobbörse der Arbeitsagentur', (q,o,r)=>`https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=${baArt()}&was=${q}&wo=${o}&umkreis=${r}`],
  ['StepStone', (q,o,r)=>`https://www.stepstone.de/jobs/${q}/in-${o}?radius=${r}`],
  ['Indeed', (q,o,r)=>`https://de.indeed.com/jobs?q=${q}&l=${o}&radius=${r}`],
  ['LinkedIn', (q,o)=>`https://www.linkedin.com/jobs/search/?keywords=${q}&location=${o}`],
  ['XING', (q,o,r)=>`https://www.xing.com/jobs/search?keywords=${q}&location=${o}&radius=${r}`],
  ['Google Jobs', (q,o)=>`https://www.google.com/search?q=${q}+jobs+${o}&ibp=htl;jobs`],
  ['meinestadt.de', (q,o)=>`https://jobs.meinestadt.de/${o}/suche?words=${q}`],
  ['kimeta', (q,o)=>`https://www.kimeta.de/search?q=${q}&loc=${o}`],
  // Adressen Stand 27.09.2026 (teils nur aus Suchergebnissen bekannt). Drittes Feld: 'mehr' = unter „weitere“, sonst Branchen-Kürzel
  ['Monster', (q,o)=>`https://www.monster.de/jobs/q-${sl(q)}-jobs${o ? '-l-' + sl(o) : ''}`],
  ['service.bund.de', (q,o)=>`https://www.service.bund.de/Content/DE/Stellen/Suche/Formular.html?nn=4642046&type=0&templateQueryString=${q}&city_zipcode=${o}`],
  ['stellenanzeigen.de', (q,o)=>ddg('stellenanzeigen.de', q, o), 'mehr'],
  ['Interamt', ()=>'https://karriere.interamt.de/jobs', 'mehr'],
  ['Yourfirm', (q,o)=>ddg('yourfirm.de', q, o), 'mehr'],
  ['Workwise', (q,o)=>`https://www.workwise.io/jobs/${sl(o) || 'deutschland'}/${sl(q)}`, 'mehr'],
  ['jobninja', (q,o)=>o ? `https://jobninja.com/stadt/${sl(o)}` : 'https://jobninja.com/', 'mehr'],
  ['hokify', (q,o)=>`https://hokify.de/jobs/m/${sl(q)}/${sl(o)}`, 'mehr'],
  ['Absolventa', (q,o)=>ddg('absolventa.de', q, o), 'absolventa'],
  ['Staufenbiel', (q,o)=>ddg('staufenbiel.de', q, o), 'staufenbiel'],
  ['Medi-Jobs', (q,o)=>ddg('medi-jobs.de', q, o), 'medijobs'],
  ['praktischArzt', (q,o)=>`https://www.praktischarzt.de/${sl(q)}/${o ? sl(o) + '/' : ''}`, 'praktischarzt'],
  ['HOGAPAGE', (q,o)=>`https://www.hogapage.de/jobs/${sl(q)}${o ? '-in-' + sl(o) : ''}`, 'hogapage'],
  ['jobvector', (q,o)=>`https://www.jobvector.de/jobs/${encodeURIComponent(decodeURIComponent(q).toLowerCase()).replace(/%20/g, '+')}/${o ? sl(o) + '/' : ''}`, 'jobvector'],
  ['heise Jobs', (q,o)=>`https://jobs.heise.de/Jobs/${q}/${encodeURIComponent(city(o))}`, 'heise'],
  ['Salesjob', (q,o)=>`https://www.salesjob.de/jobs/${sl(q)}-jobs${o ? '-' + sl(o) : ''}/`, 'salesjob'],
  ['medien.jobs', (q,o)=>`https://medienjobs.boersenblatt.net/jobs${o ? '/' + sl(o) : ''}`, 'medienjobs'],
  ['greenjobs', (q,o)=>`https://www.greenjobs.de/stellenanzeige/${o ? sl(o) + '/' : ''}`, 'greenjobs'],
  ['nachhaltigejobs', (q,o)=>`https://www.nachhaltigejobs.de/jobs${o ? '/' + sl(o) : '/suche'}`, 'nachhaltigejobs'],
  // Ausbildung (nur bei „Ausbildung / duales Studium“) – Such-Adressen nicht geprüft, daher über DuckDuckGo mit site:
  ['ausbildung.de', (q,o)=>ddg('ausbildung.de', 'Ausbildung ' + decodeURIComponent(q), o), 'ausbildung'],
  ['azubi.de', (q,o)=>ddg('azubi.de', 'Ausbildung ' + decodeURIComponent(q), o), 'ausbildung'],
  ['AZUBIYO', (q,o)=>ddg('azubiyo.de', 'Ausbildung ' + decodeURIComponent(q), o), 'ausbildung'],
  ['aubi-plus', (q,o)=>ddg('aubi-plus.de', 'Ausbildung ' + decodeURIComponent(q), o), 'ausbildung'],
  // Studium (nur bei „Studium“)
  ['Hochschulkompass', (q,o)=>ddg('hochschulkompass.de', decodeURIComponent(q) + ' Studium', o), 'studium'],
  ['studieren.de', (q,o)=>ddg('studieren.de', decodeURIComponent(q) + ' Studium', o), 'studium'],
  ['Duales Studium (BA-Jobbörse)', (q,o,r)=>`https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=4&was=${encodeURIComponent('Duales Studium ' + decodeURIComponent(q))}&wo=${o}&umkreis=${r}`, 'studium']
];
function baArt() { try { const v = document.getElementById('f_type').value; return /^\d+$/.test(v) ? v : 1; } catch { return 1; } }
/* Hilfen für die Links: Ort ohne PLZ, URL-Teil („Slug“), Suche nur auf einer Seite über DuckDuckGo */
function city(o) { return decodeURIComponent(o || '').replace(/\b\d{5}\b/g, ' ').split(',')[0].trim(); }
function sl(s) { return city(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function ddg(site, q, o) { let t = q; try { t = decodeURIComponent(q); } catch {} return 'https://duckduckgo.com/?q=' + encodeURIComponent(`site:${site} ${t} ${city(o)}`.trim()); }

/* Demodaten: damit die App ohne Internet/Schnittstelle ausprobiert werden kann */
window.DEMO_JOBS = [
  {id:'demo-1',source:'Demo',title:'Elektroniker für Energie- und Gebäudetechnik (m/w/d)',company:'Musterbau GmbH',location:'Berlin',lat:52.52,lon:13.40,salaryMin:3200,salaryMax:3900,worktime:'vz',published:'2026-09-20',description:'Wir suchen Verstärkung für Elektroinstallation in Neubauten. Anforderungen: abgeschlossene Ausbildung Elektrotechnik, Erfahrung mit Photovoltaik, Führerschein Klasse B, Teamfähigkeit, Zuverlässigkeit. Bewerbung an jobs@musterbau.example',url:'https://example.com/karriere/elektroniker',email:'jobs@musterbau.example'},
  {id:'demo-2',source:'Demo',title:'Servicetechniker Haustechnik (m/w/d)',company:'Wärme & Co. KG',location:'Potsdam',lat:52.39,lon:13.06,salaryMin:3000,salaryMax:3600,worktime:'vz',published:'2026-09-18',description:'Wartung und Instandhaltung von Heizungs- und Klimaanlagen (SHK), Elektrotechnik-Grundkenntnisse, Führerschein Klasse B, selbstständige Arbeitsweise, Kundenorientierung.',url:'https://example.com/jobs/servicetechniker',email:''},
  {id:'demo-3',source:'Demo',title:'Fachkraft für Lagerlogistik (m/w/d)',company:'LogiTrans AG',location:'Berlin',lat:52.45,lon:13.52,salaryMin:2600,salaryMax:2900,worktime:'vz',published:'2026-09-22',description:'Wareneingang, Kommissionierung, Versand, Staplerschein erforderlich, Schichtarbeit, SAP-Kenntnisse von Vorteil.',url:'https://example.com/logitrans/lager',email:'bewerbung@logitrans.example'},
  {id:'demo-4',source:'Demo',title:'Elektriker / Elektroinstallateur (m/w/d) – Teilzeit möglich',company:'Stadtwerke Beispielstadt',location:'Brandenburg an der Havel',lat:52.41,lon:12.55,salaryMin:null,salaryMax:null,worktime:'tz',published:'2026-09-10',description:'Elektroinstallation, Wartung, Messtechnik, Dokumentation. Wir bieten Tarifvertrag TVöD, 30 Tage Urlaub.',url:'',email:'karriere@stadtwerke.example'},
  {id:'demo-5',source:'Demo',title:'Softwareentwickler JavaScript (m/w/d)',company:'Code Beispiel GmbH',location:'Remote',lat:null,lon:null,salaryMin:4200,salaryMax:5500,worktime:'ho',published:'2026-09-24',description:'React, TypeScript, Node.js, Git, Scrum. Englisch fließend.',url:'https://example.com/code/jobs/js',email:''},
  {id:'demo-6',source:'Demo',title:'Mechatroniker Instandhaltung (m/w/d)',company:'Produktionswerk Nord',location:'Oranienburg',lat:52.75,lon:13.24,salaryMin:3300,salaryMax:4000,worktime:'snw',published:'2026-09-15',description:'Wartung und Instandhaltung von Anlagen, SPS Siemens S7, Hydraulik, Pneumatik, Elektrotechnik, Schichtarbeit.',url:'https://example.com/werk-nord/mechatroniker',email:'hr@werk-nord.example'}
];
