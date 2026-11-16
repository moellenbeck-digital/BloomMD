import * as migration_20261111_080255_initial from './20261111_080255_initial';
import * as migration_20261111_081000_svc_support from './20261111_081000_svc_support';
import * as migration_20261116_202539_media_s3_fields from './20261116_202539_media_s3_fields';

export const migrations = [
  {
    up: migration_20261111_080255_initial.up,
    down: migration_20261111_080255_initial.down,
    name: '20261111_080255_initial',
  },
  {
    up: migration_20261111_081000_svc_support.up,
    down: migration_20261111_081000_svc_support.down,
    name: '20261111_081000_svc_support',
  },
  {
    up: migration_20261116_202539_media_s3_fields.up,
    down: migration_20261116_202539_media_s3_fields.down,
    name: '20261116_202539_media_s3_fields'
  },
];
