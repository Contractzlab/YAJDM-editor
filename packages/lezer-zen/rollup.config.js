import { nodeResolve } from '@rollup/plugin-node-resolve';
import path from 'path';

export default {
  input: './src/parser.js',
  output: [
    { format: 'cjs', file: './dist/index.cjs' },
    { format: 'es', file: './dist/index.js' },
  ],
  external(id) {
    return !/^[\.\/]/.test(id) && !path.isAbsolute(id);
  },
  plugins: [nodeResolve()],
};
