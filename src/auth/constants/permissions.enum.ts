export enum Permission {
  // Users
  READ_USERS = 'read:users',
  WRITE_USERS = 'write:users',
  DELETE_USERS = 'delete:users',

  // Products
  READ_PRODUCTS = 'read:products',
  WRITE_PRODUCTS = 'write:products',
  DELETE_PRODUCTS = 'delete:products',
  MANAGE_INVENTORY = 'manage:inventory',

  // Orders
  READ_OWN_ORDERS = 'read:own_orders',
  READ_ALL_ORDERS = 'read:all_orders',
  UPDATE_ORDER_STATUS = 'update:order_status',
  CANCEL_ORDERS = 'cancel:orders',
  WRITE_ORDERS = 'write:orders',
}
