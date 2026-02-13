import { Role } from './roles.enum';
import { Permission } from './permissions.enum';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    Permission.READ_USERS,
    Permission.WRITE_USERS,
    Permission.DELETE_USERS,
    Permission.READ_PRODUCTS,
    Permission.WRITE_PRODUCTS,
    Permission.DELETE_PRODUCTS,
    Permission.MANAGE_INVENTORY,
    Permission.READ_ALL_ORDERS,
    Permission.UPDATE_ORDER_STATUS,
    Permission.CANCEL_ORDERS,
  ],

  [Role.WAREHOUSE_MANAGER]: [
    Permission.READ_PRODUCTS,
    Permission.MANAGE_INVENTORY,
    Permission.READ_ALL_ORDERS,
    Permission.UPDATE_ORDER_STATUS,
  ],

  [Role.CUSTOMER_SUPPORT]: [
    Permission.READ_USERS,
    Permission.READ_PRODUCTS,
    Permission.READ_ALL_ORDERS,
    Permission.UPDATE_ORDER_STATUS,
    Permission.CANCEL_ORDERS,
    Permission.WRITE_ORDERS,
  ],

  [Role.CUSTOMER]: [Permission.READ_PRODUCTS, Permission.READ_OWN_ORDERS],
};
