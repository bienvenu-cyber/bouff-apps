import { IAddress } from './users.interface';

export interface IUsersResponseGraphQL {
  users: IUserResponseLegacy[];
}

export interface IUserResponseLegacy {
  _id: string;
  name: string;
  email: string;
  phone: string;
  addresses: IAddress[];
  __typename: 'User';
}
