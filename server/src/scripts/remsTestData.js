import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Phase from '../models/Phase.js';
import Block from '../models/Block.js';
import Property from '../models/Property.js';
import Client from '../models/Client.js';
import Agent from '../models/Agent.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import { buildSchedule } from '../../../shared/paymentSchedule.js';

// Deliberately requires an explicit local URI and a disposable database name.
// Never loads .env, defaults, or the office server's MONGODB_URI.
const prefix = 'TST-REMS-';
function safeTarget() {
  if (process.env.REMS_TEST_MODE !== '1') throw new Error('Set REMS_TEST_MODE=1 only for an isolated test run.');
  const raw = process.env.REMS_TEST_MONGODB_URI;
  if (!raw) throw new Error('Set REMS_TEST_MONGODB_URI to a local disposable MongoDB database.');
  const uri = new URL(raw);
  const database = decodeURIComponent(uri.pathname.replace(/^\//, ''));
  if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol) || !['localhost', '127.0.0.1', '::1'].includes(uri.hostname)) throw new Error('Test data commands only accept a MongoDB server on this computer.');
  if (!/^rems_test_[a-z0-9_]+$/i.test(database) || database.toLowerCase() === 'property_management') throw new Error('Database name must start with rems_test_ and must not be property_management.');
  return { raw, database };
}

async function resetFixture() {
  await PropertyAssignment.deleteMany({ assignmentId: new RegExp(`^${prefix}`) });
  await Property.deleteMany({ propertyId: new RegExp(`^${prefix}`) });
  await Client.deleteMany({ clientId: new RegExp(`^${prefix}`) });
  await Agent.deleteMany({ agentId: new RegExp(`^${prefix}`) });
  await Block.deleteMany({ blockId: new RegExp(`^${prefix}`) });
  await Phase.deleteMany({ phaseId: new RegExp(`^${prefix}`) });
  await Project.deleteMany({ projectId: new RegExp(`^${prefix}`) });
  await User.deleteMany({ username: /^rems-test-/ });
}

async function seed() {
  await resetFixture();
  const passwordHash = await bcrypt.hash('REMS-Test-Only-2026!', 10);
  const admin = await User.create({ username: 'rems-test-admin', firstName: 'Test', lastName: 'Administrator', email: 'rems-test-admin@example.invalid', passwordHash, role: 'ADMIN' });
  const agents = await Agent.insertMany(Array.from({ length: 5 }, (_, i) => ({ agentId: `${prefix}AGENT-${String(i + 1).padStart(2, '0')}`, fullName: `Test Agent ${i + 1}`, agentType: 'INTERNAL', status: 'ACTIVE', createdBy: admin._id })));
  const projectRows = await Project.insertMany(Array.from({ length: 3 }, (_, i) => ({ projectId: `${prefix}PROJECT-${i + 1}`, projectName: `REMS Test Project ${i + 1}`, projectCode: `${prefix}P${i + 1}`, location: 'Test Location', status: 'ACTIVE', createdBy: admin._id })));
  const lots = [];
  for (const [pIndex, project] of projectRows.entries()) {
    for (let phaseNumber = 1; phaseNumber <= 2; phaseNumber++) {
      await Phase.create({ phaseId: `${prefix}P${pIndex + 1}-PH-${phaseNumber}`, project: project._id, phaseNumber });
      for (let blockNumber = 1; blockNumber <= 3; blockNumber++) {
        await Block.create({ blockId: `${prefix}P${pIndex + 1}-PH-${phaseNumber}-BL-${blockNumber}`, project: project._id, phaseNumber, blockNumber });
        for (let lotNumber = 1; lotNumber <= 10; lotNumber++) {
          const areaSqm = 80 + ((phaseNumber * 7 + blockNumber * 5 + lotNumber) % 6) * 10;
          const property = await Property.create({ propertyId: `${prefix}P${pIndex + 1}-${phaseNumber}-${blockNumber}-${lotNumber}`, project: project._id, phaseNumber, blockNumber, lotNumber, areaSqm, pricePerSqm: 12000 + pIndex * 500, status: 'AVAILABLE', createdBy: admin._id });
          lots.push({ property, project, phaseNumber, blockNumber, lotNumber });
        }
      }
    }
  }
  const clients = await Client.insertMany(Array.from({ length: 20 }, (_, i) => ({ clientId: `${prefix}CLIENT-${String(i + 1).padStart(2, '0')}`, firstName: `Fictional${i + 1}`, lastName: 'Testbuyer', contactNumber: `09${String(i + 1).padStart(9, '0')}`, email: `buyer${i + 1}@example.invalid`, address: 'REMS isolated test data', createdBy: admin._id })));

  // These fixtures are for UI navigation and repeatable ledger scenarios. Financial
  // states are generated from schedules/payments; scenarioLabels make test intent explicit.
  const scenarios = [
    'active-no-payment', 'down-payment', 'one-installment-paid', 'advance-three-months',
    'partial-installment', 'overdue-below-threshold', 'forfeiture-threshold-three',
    'amendment-review-candidate', 'lot-transfer-source-candidate', 'lot-transfer-destination-candidate',
    'cancelled-history', 'fully-paid', 'multiple-property-primary', 'multiple-property-secondary',
    'agent-allocation', 'cash-payment', 'noncash-payment', 'penalty-waiver-review',
    'financial-correction-review'
  ];
  const assignments = [];
  for (let i = 0; i < scenarios.length; i++) {
    const clientIndex = i === 13 ? 12 : i;
    const lot = lots[i];
    const lifecycle = scenarios[i] === 'cancelled-history' ? 'CANCELLED' : 'ACTIVE';
    const totalCents = Math.round((lot.property.areaSqm * lot.property.pricePerSqm) * 100);
    const downPaymentCents = i === 1 ? Math.round(totalCents * 0.1) : 0;
    const contractDate = '2025-01-01';
    const firstDueDate = '2025-02-05';
    const schedule = buildSchedule(totalCents, 24, firstDueDate, downPaymentCents, contractDate);
    const payments = [];
    const monthly = schedule.find(row => row.installment > 0).amountCents;
    const amountFor = i === 2 || i === 5 || i === 6 || i === 9 || i === 12 || i === 13 ? monthly :
      i === 3 ? schedule.filter(row => row.installment > 0).slice(0, 3).reduce((n, row) => n + row.amountCents, 0) :
      i === 4 ? Math.max(1, Math.floor(monthly / 2)) :
      i === 11 ? totalCents : downPaymentCents;
    if (amountFor > 0) payments.push({ paymentId: `${prefix}PAY-${String(i + 1).padStart(2, '0')}`, receiptNumber: `${prefix}OR-${String(i + 1).padStart(2, '0')}`, requestId: `rems-test-request-${i + 1}`, amountCents: amountFor, paymentDate: i === 3 ? '2025-02-05' : '2025-02-05', method: i === 16 ? 'BANK_TRANSFER' : 'CASH', type: i === 1 ? 'DOWN_PAYMENT' : 'INSTALLMENT', monthsToPay: i === 3 ? 3 : undefined, createdBy: admin._id });
    const account = await PropertyAssignment.create({ assignmentId: `${prefix}CONTRACT-${String(i + 1).padStart(2, '0')}`, client: clients[clientIndex]._id, project: lot.project._id, property: lot.property._id, lifecycle, contract: { totalCents, downPaymentCents, months: 24, monthlyInstallmentCents: monthly, contractDate, firstDueDate, schedule, monitoringTerms: { dueDay: 5, graceDays: 5, penaltyPercentage: 3, forfeitureMonths: scenarios[i] === 'forfeiture-threshold-three' ? 3 : 6, criticalMonths: 2, reminderDays: 3, penaltyStatus: 'ACTIVE', penaltyBasis: 'UNPAID_BALANCE', allocationPriority: 'PRINCIPAL_FIRST', frequency: 'MONTHLY', effectiveDate: contractDate } }, payments, penaltyCalculationRule: 'CURRENT_OVERDUE', createdBy: admin._id });
    assignments.push({ account, lot, scenario: scenarios[i] });
    if (lifecycle === 'ACTIVE') await Property.updateOne({ _id: lot.property._id }, { $set: { status: 'RESERVED', client: clients[clientIndex]._id } });
  }
  // One active client has two independent active contracts, matching REMS's model.
  await Agent.updateOne({ _id: agents[0]._id }, { $set: { assignedProjects: [projectRows[0]._id] } });
  console.log(JSON.stringify({ mode: 'TEST DATA ONLY', database: mongoose.connection.name, adminLogin: 'rems-test-admin / REMS-Test-Only-2026!', projects: projectRows.length, phases: 6, blocks: 18, lots: lots.length, clients: clients.length, agents: agents.length, contracts: assignments.length, scenarios: assignments.map(x => ({ contract: x.account.assignmentId, client: x.account.client, scenario: x.scenario })), note: 'All IDs are TST-REMS-prefixed. No real client/agent/contact data is used.' }, null, 2));
}

const { raw, database } = safeTarget();
if (!['seed', 'reset'].includes(process.argv[2])) throw new Error('Usage: npm --prefix server run testdata:seed | testdata:reset');
await mongoose.connect(raw, { dbName: database, autoIndex: true });
try {
  if (process.argv[2] === 'seed') await seed();
  else { await resetFixture(); console.log(`Removed only TST-REMS fixtures from isolated database ${database}.`); }
} finally { await mongoose.disconnect(); }
