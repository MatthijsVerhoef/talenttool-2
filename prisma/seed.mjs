// prisma/seed.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starten met database seed...');

  // Bestaande data opschonen
  console.log('🗑️  Bestaande data wordt opgeschoond...');
  await prisma.agentMessage.deleteMany({});
  await prisma.overseerMessage.deleteMany({});
  await prisma.coachingSession.deleteMany({});
  await prisma.clientGoal.deleteMany({});
  await prisma.client.deleteMany({});

  // Clients aanmaken
  console.log('👥 Clients aanmaken...');
  
  const client1 = await prisma.client.create({
    data: {
      name: 'Sarah Johnson',
      focusArea: 'Leiderschapsontwikkeling',
      summary: 'Senior manager die wil doorgroeien naar een executive leiderschapsrol. Richt zich op strategisch denken en teamontwikkeling.',
      goals: {
        create: [
          { value: 'Ontwikkelen van executive presence en communicatieve vaardigheden' },
          { value: 'Een hoogpresterend team van 20+ personen opbouwen' },
          { value: 'Een belangrijk strategisch initiatief leiden in Q1 2025' },
        ],
      },
    },
  });

  const client2 = await prisma.client.create({
    data: {
      name: 'Michael Chen',
      focusArea: 'Carrièretransitie',
      summary: 'Software engineer die overstapt naar productmanagement. Wil zijn technische achtergrond benutten en tegelijkertijd zakelijke vaardigheden ontwikkelen.',
      goals: {
        create: [
          { value: 'Voltooien van productmanagementcertificering' },
          { value: 'Eerste productlancering leiden vóór medio 2025' },
          { value: 'Netwerk opbouwen binnen de productmanagementcommunity' },
          { value: 'Vaardigheden in marktanalyse en klantonderzoek ontwikkelen' },
        ],
      },
    },
  });

  const client3 = await prisma.client.create({
    data: {
      name: 'Emma Rodriguez',
      focusArea: 'Werk-privébalans',
      summary: 'Startup-oprichter die worstelt met burn-out. Wil duurzame gewoontes opbouwen terwijl het bedrijf groeit.',
      goals: {
        create: [
          { value: 'Duidelijke grenzen creëren tussen werk- en privétijd' },
          { value: '30% van huidige verantwoordelijkheden delegeren vóór Q2 2025' },
          { value: 'Wekelijkse zelfzorgroutine implementeren' },
        ],
      },
    },
  });

  const client4 = await prisma.client.create({
    data: {
      name: 'Maarten van Heugten',
      focusArea: 'Public Speaking',
      summary: 'Technisch expert die een thought leader wil worden. Werkt aan conferentiepresentaties en contentcreatie.',
      goals: {
        create: [
          { value: 'Keynote geven op een grote brancheconferentie' },
          { value: '12 technische artikelen publiceren in 2025' },
          { value: 'Socialmediabereik uitbreiden naar 10.000 volgers' },
          { value: 'Een technische podcast of YouTube-kanaal lanceren' },
        ],
      },
    },
  });

  const client5 = await prisma.client.create({
    data: {
      name: 'Lisa Thompson',
      focusArea: 'Teammanagement',
      summary: 'Nieuwe manager, gepromoveerd vanuit een individuele rol. Leert omgaan met teamdynamiek en prestatiemanagement.',
      goals: {
        create: [
          { value: 'Managementtrainingsprogramma voltooien' },
          { value: 'Team engagement-scores met 20% verbeteren' },
          { value: 'Drie nieuwe teamleden succesvol aannemen en onboarden' },
        ],
      },
    },
  });

  // Coaching sessies + berichten
  console.log('💬 Coaching sessies met berichten aanmaken...');

  // Sarah Johnson
  const session1 = await prisma.coachingSession.create({
    data: {
      clientId: client1.id,
      title: 'Initiële Analyse - Leiderschapsdoelen',
      messages: {
        create: [
          {
            role: 'coach',
            content: 'Welkom Sarah! Ik kijk ernaar uit om met je te werken aan je leiderschapsontwikkeling. Laten we beginnen met jouw visie op executive leadership. Hoe ziet succesvol leiderschap op dat niveau er volgens jou uit?',
            meta: { type: 'opening', category: 'assessment' },
          },
          {
            role: 'client',
            content: 'Voor mij betekent executive leadership strategisch kunnen nadenken over het bedrijf en teams inspireren om ambitieuze doelen te bereiken. Ik wil verder gaan dan alleen taken managen en echte transformatie leiden.',
            meta: { type: 'response', category: 'vision' },
          },
          {
            role: 'coach',
            content: 'Dat is een krachtige visie. Laten we dit opsplitsen in concrete stappen. Welke specifieke vaardigheden denk je dat je moet ontwikkelen om deze overgang te maken?',
            meta: { type: 'exploration', category: 'skills_assessment' },
          },
          {
            role: 'client',
            content: 'Ik moet werken aan executive presence, strategisch denken en stakeholdermanagement. Ik ben sterk met mijn directe team, maar vind interacties met de C-suite lastig.',
            meta: { type: 'response', category: 'skills_gap' },
          },
        ],
      },
    },
  });

  const session2 = await prisma.coachingSession.create({
    data: {
      clientId: client1.id,
      title: 'Workshop Strategisch Denken',
      messages: {
        create: [
          {
            role: 'coach',
            content: 'Laten we vandaag werken aan strategisch denken. Ik wil dat je de positie van jouw afdeling binnen de bredere organisatie analyseert. Welke waarde creëert jouw team?',
            meta: { type: 'exercise', category: 'strategic_thinking' },
          },
          {
            role: 'client',
            content: 'Wij zijn de innovatie-motor — we prototypen nieuwe features die grote productlijnen kunnen worden. Maar ik merk dat ik te veel focus op huidige projecten en te weinig op toekomstige kansen.',
            meta: { type: 'insight', category: 'self_reflection' },
          },
        ],
      },
    },
  });

  // Michael Chen
  const session3 = await prisma.coachingSession.create({
    data: {
      clientId: client2.id,
      title: 'Carrière-Pivot Strategie',
      messages: {
        create: [
          {
            role: 'coach',
            content: 'Michael, de overgang van engineering naar productmanagement is een spannende stap. Welke aspecten van productmanagement spreken je het meest aan?',
            meta: { type: 'opening', category: 'career_exploration' },
          },
          {
            role: 'client',
            content: 'Ik vind het geweldig om productstrategie te beïnvloeden en direct met klanten te werken. Als engineer voelde ik me vaak losgekoppeld van het “waarom” achter wat we bouwden.',
            meta: { type: 'response', category: 'motivation' },
          },
          {
            role: 'coach',
            content: 'Je technische achtergrond is een grote troef. Laten we een 90-dagenplan maken om je PM-vaardigheden te ontwikkelen terwijl je je engineeringervaring benut. Welke PM-vaardigheden wil je als eerste versterken?',
            meta: { type: 'planning', category: 'skill_development' },
          },
        ],
      },
    },
  });

  // Emma Rodriguez
  const session4 = await prisma.coachingSession.create({
    data: {
      clientId: client3.id,
      title: 'Herstelplan bij Burn-out',
      messages: {
        create: [
          {
            role: 'coach',
            content: 'Emma, dank dat je open bent over je burn-out. Laten we beginnen met het begrijpen van je huidige dagelijkse routine. Neem me mee door een typische dag.',
            meta: { type: 'assessment', category: 'lifestyle_audit' },
          },
          {
            role: 'client',
            content: 'Ik begin meestal om 6 uur met e-mails en werk door tot 9 of 10 uur ’s avonds. In het weekend “valt het mee” — dan werk ik maar 4–5 uur. Ik weet dat het onhoudbaar is, maar ik ben bang dat alles instort als ik minder doe.',
            meta: { type: 'response', category: 'current_state' },
          },
          {
            role: 'coach',
            content: 'Dank dat je dit deelt. Die angst is heel herkenbaar bij founders. Laten we onderzoeken wat “instorten” voor jou betekent en manieren ontwikkelen zodat je kunt rusten zonder die constante spanning.',
            meta: { type: 'exploration', category: 'fear_analysis' },
          },
        ],
      },
    },
  });

  // David Park
  const session5 = await prisma.coachingSession.create({
    data: {
      clientId: client4.id,
      title: 'Je Spreekplatform Opbouwen',
      messages: {
        create: [
          {
            role: 'coach',
            content: 'David, een thought leader worden vraagt expertise én zichtbaarheid. Je hebt diepgaande technische kennis — nu moeten we het effectief verpakken. Over welke onderwerpen ben je het meest gepassioneerd?',
            meta: { type: 'exploration', category: 'content_strategy' },
          },
          {
            role: 'client',
            content: 'Ik ben echt gepassioneerd over AI-ethiek en verantwoord gebruik van machine learning. Ik heb zoveel praktijkverhalen waar andere engineers van kunnen leren.',
            meta: { type: 'response', category: 'expertise_area' },
          },
          {
            role: 'coach',
            content: 'Dat is een actueel en belangrijk onderwerp! Laten we je unieke perspectief vormgeven. Welke controversiële of opvallende visie heb jij op AI-ethiek die anderen misschien niet delen?',
            meta: { type: 'differentiation', category: 'thought_leadership' },
          },
        ],
      },
    },
  });

  // Lisa Thompson
  const session6 = await prisma.coachingSession.create({
    data: {
      clientId: client5.id,
      title: 'Fundamenten voor Eerste-Keer Managers',
      messages: {
        create: [
          {
            role: 'coach',
            content: 'Lisa, gefeliciteerd met je promotie! De overgang van collega naar manager kan uitdagend zijn. Welke aspecten vind je tot nu toe het moeilijkst?',
            meta: { type: 'assessment', category: 'challenges' },
          },
          {
            role: 'client',
            content: 'Het lastigste is het geven van feedback aan mensen met wie ik eerst op gelijke voet stond. Ik ben bang dat ik relaties beschadig of overkom alsof ik “machtsmisbruik” pleeg.',
            meta: { type: 'response', category: 'interpersonal_challenge' },
          },
          {
            role: 'coach',
            content: 'Dit is één van de meest voorkomende uitdagingen voor nieuwe managers. Laten we wat feedbackscenario’s oefenen met het SBI-model (Situatie-Gedrag-Impact). Dat helpt je om objectief en constructief feedback te geven.',
            meta: { type: 'skill_building', category: 'feedback_training' },
          },
        ],
      },
    },
  });

  // Overseer Messages (Systeem-/Administratieve berichten)
  console.log('📋 Overseer-berichten aanmaken...');
  
  await prisma.overseerMessage.createMany({
    data: [
      {
        role: 'system',
        content: 'Coachingplatform geïnitieerd met nieuwe AI-ondersteunde functies',
        meta: { type: 'announcement', version: '2.0.0' },
      },
      {
        role: 'system',
        content: 'Wekelijkse voortgangsrapportages zijn nu beschikbaar voor alle actieve cliënten',
        meta: { type: 'feature_update', feature: 'reporting' },
      },
      {
        role: 'admin',
        content: 'Coachingresultaten Q4 2024: 87% van de cliënten behaalde ten minste één belangrijk doel',
        meta: { type: 'metrics', period: 'Q4-2024' },
      },
      {
        role: 'system',
        content: 'Nieuwe assessmenttools geïntegreerd: Leadership 360, Career Values Inventory',
        meta: { type: 'tool_update', tools: ['Leadership 360', 'Career Values Inventory'] },
      },
      {
        role: 'admin',
        content: 'Herinnering: alle coaches dienen de kwartaaltraining over actief luisteren te voltooien vóór 2025-01-31',
        meta: { type: 'training_reminder', due_date: '2025-01-31' },
      },
    ],
  });

  // Samenvatting loggen
  console.log('\n✅ Seed succesvol voltooid!');
  console.log(`📊 Samenvatting:`);
  console.log(`   - ${await prisma.client.count()} clients aangemaakt`);
  console.log(`   - ${await prisma.clientGoal.count()} doelen aangemaakt`);
  console.log(`   - ${await prisma.coachingSession.count()} coaching sessies aangemaakt`);
  console.log(`   - ${await prisma.agentMessage.count()} berichten aangemaakt`);
  console.log(`   - ${await prisma.overseerMessage.count()} overseer-berichten aangemaakt`);
}

main()
  .catch((e) => {
    console.error('❌ Seed mislukt:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
