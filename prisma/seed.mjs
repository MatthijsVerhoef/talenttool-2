// prisma/seed.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starten met database seed...');

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

  // Coaching sessies zonder vooraf ingevulde berichten
  console.log('💬 Lege coaching sessies aanmaken...');
  const sessions = [
    { clientId: client1.id, title: 'Initiële Analyse - Leiderschapsdoelen' },
    { clientId: client1.id, title: 'Workshop Strategisch Denken' },
    { clientId: client2.id, title: 'Carrière-Pivot Strategie' },
    { clientId: client3.id, title: 'Herstelplan bij Burn-out' },
    { clientId: client4.id, title: 'Je Spreekplatform Opbouwen' },
    { clientId: client5.id, title: 'Fundamenten voor Eerste-Keer Managers' },
  ];

  for (const session of sessions) {
    await prisma.coachingSession.create({ data: session });
  }

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
