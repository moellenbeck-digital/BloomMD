import * as migration_20261111_080255_initial from './20261111_080255_initial';
import * as migration_20261111_081000_svc_support from './20261111_081000_svc_support';
import * as migration_20261115_164857_operator_audit_mfa from './20261115_164857_operator_audit_mfa';

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
    up: migration_20261115_164857_operator_audit_mfa.up,
    down: migration_20261115_164857_operator_audit_mfa.down,
    name: '20261115_164857_operator_audit_mfa'
  },
];
