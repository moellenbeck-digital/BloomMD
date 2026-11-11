import * as migration_20261111_080255_initial from './20261111_080255_initial';
import * as migration_20261111_081000_svc_support from './20261111_081000_svc_support';

export const migrations = [
  {
    up: migration_20261111_080255_initial.up,
    down: migration_20261111_080255_initial.down,
    name: '20261111_080255_initial',
  },
  {
    up: migration_20261111_081000_svc_support.up,
    down: migration_20261111_081000_svc_support.down,
    name: '20261111_081000_svc_support'
  },
];
