import mongoose from 'mongoose';

// Inspects a MongoDB URI WITHOUT ever returning the URI, username or password.
// Returns a list of plain-language problems (empty list = the format looks fine).
export function diagnoseMongoUri(raw) {
  const problems = [];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return ['MONGODB_URI is empty or not loaded. Check server/.env exists, is named exactly ".env", and has a line MONGODB_URI=...'];
  }
  const uri = String(raw);
  if (uri !== uri.trim()) problems.push('The value has a leading or trailing space.');
  const v = uri.trim();
  if (!/^mongodb(\+srv)?:\/\//.test(v)) {
    if (/^MONGODB_URI\s*=/i.test(v)) problems.push('The value itself starts with "MONGODB_URI=" (the name was pasted twice).');
    else if (/^[<"'`]/.test(v)) problems.push('The value starts with a bracket or quote character before "mongodb".');
    else if (/mongodb(\+srv)?:\/\//.test(v)) problems.push('There is extra text before "mongodb+srv://" — the value must begin with it.');
    else problems.push('The value does not start with "mongodb://" or "mongodb+srv://".');
    return problems;
  }
  if (/\s/.test(v)) problems.push('The value contains a space or line break.');
  if (/[<>]/.test(v)) problems.push('It still contains < or > (the "<password>" placeholder brackets must be removed along with the placeholder).');
  const rest = v.slice(v.indexOf('://') + 3);
  const atCount = (rest.match(/@/g) || []).length;
  if (atCount === 0) problems.push('No "@" found: the format must be username:password@host.');
  if (atCount > 1) problems.push('More than one "@" — the password probably contains an "@" that must be written as %40.');
  const userinfo = atCount ? rest.slice(0, rest.lastIndexOf('@')) : '';
  if (/[/?#]/.test(userinfo)) problems.push('The username or password contains / ? or # which must be URL-encoded (%2F %3F %23).');
  if (userinfo && (userinfo.match(/:/g) || []).length > 1) problems.push('The password contains ":" which must be written as %3A.');
  if (/%(?![0-9A-Fa-f]{2})/.test(userinfo)) problems.push('The password contains a "%" that is not part of a valid %XX code (write a literal % as %25).');
  const host = atCount ? rest.slice(rest.lastIndexOf('@') + 1).split(/[/?]/)[0] : '';
  if (atCount && !host) problems.push('No host name after the "@".');
  if (v.startsWith('mongodb+srv://') && host.includes(':')) problems.push('mongodb+srv:// URIs must not include a :port.');
  return problems;
}

export async function connectDB(uri) {
  const value = typeof uri === 'string' ? uri.trim() : uri;
  const problems = diagnoseMongoUri(uri);
  try {
    if (!value) throw new Error('MONGODB_URI is not set');
    mongoose.set('strictQuery', true);
    await mongoose.connect(value, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    // Re-throw a safe message: never include the URI (it contains the password).
    const hint = problems.length ? ` Likely cause: ${problems.join(' ')}` : '';
    const safe = new Error(`${err.name === 'MongoParseError' ? 'MongoDB connection string is malformed.' : err.message}${hint}`);
    safe.cause = undefined;
    throw safe;
  }
}
