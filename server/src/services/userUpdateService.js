import mongoose from 'mongoose';
import User from '../models/User.js';
import AdministrationGuard from '../models/AdministrationGuard.js';

const fail = (message, statusCode = 409) => {throw Object.assign(new Error(message), {statusCode});};
const removesAdministrator = (user, changes) => user.role === 'ADMIN' && user.isActive &&
  (changes.role !== undefined && changes.role !== 'ADMIN' || changes.isActive === false);

export async function updateUserSafely(userId, actorId, changes) {
  if (!mongoose.isValidObjectId(userId)) fail('Invalid user.', 400);
  if (changes.role !== undefined && !['ADMIN','STAFF','VIEWER'].includes(changes.role)) fail('Choose a valid user role.', 400);
  if (changes.isActive !== undefined && typeof changes.isActive !== 'boolean') fail('Choose an active or inactive status.', 400);
  if (String(userId) === String(actorId) && changes.isActive === false) fail('You cannot deactivate your own account.', 400);
  const current = await User.findById(userId);
  if (!current) fail('User not found.', 404);
  const save = async (user, session) => {
    const updated = await User.findOneAndUpdate(
      {_id: user._id, __v: user.__v === undefined ? {$exists:false} : user.__v},
      {$set: changes, $inc: {__v: 1}},
      {new: true, runValidators: true, ...(session ? {session} : {})}
    );
    if (!updated) fail('This user changed. Reload before saving.');
    return updated;
  };
  if (!removesAdministrator(current, changes)) return save(current);
  if (await User.countDocuments({role: 'ADMIN', isActive: true}) <= 1)
    fail('Keep at least one active administrator. Create or activate another administrator before changing this account.');
  const hello = await mongoose.connection.db.admin().command({hello: 1});
  if (!hello.setName && hello.msg !== 'isdbgrid')
    fail('Changing an active administrator requires replica-set transaction support so concurrent changes cannot remove the final administrator. No user was changed.');
  await AdministrationGuard.updateOne({_id: 'active-administrators'}, {$setOnInsert: {revision: 0}}, {upsert: true});
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      await AdministrationGuard.updateOne({_id: 'active-administrators'}, {$inc: {revision: 1}}, {session});
      const actor = await User.findById(actorId).session(session);
      if (!actor?.isActive || actor.role !== 'ADMIN') fail('Your administrator access changed. Sign in again.', 403);
      const fresh = await User.findById(userId).session(session);
      if (!fresh) fail('User not found.', 404);
      if (fresh.__v !== current.__v) fail('This user changed. Reload before saving.');
      if (removesAdministrator(fresh, changes) && await User.countDocuments({role: 'ADMIN', isActive: true}).session(session) <= 1)
        fail('Keep at least one active administrator. No user was changed.');
      updated = await save(fresh, session);
    });
    return updated;
  } finally {await session.endSession();}
}
