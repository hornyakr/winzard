import 'server-only';
import { parseEnvironment } from './env';
export const serverEnvironment = parseEnvironment(process.env);
