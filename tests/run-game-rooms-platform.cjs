const {resolve,join}=require('node:path');
const root=resolve(__dirname,'..');
process.argv[2]=root;
process.argv[3]=join(root,'tests/game-rooms-platform.test.mts');
require('./run-game-build-routes.cjs');
