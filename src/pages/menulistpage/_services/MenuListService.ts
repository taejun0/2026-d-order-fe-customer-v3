// src/pages/MenuListPage/_services/MenuListService.ts
import { instance } from '@services/instance';

/** API 응답: data.FEE / SET / MENU / DRINK 구조 */
export type ApiMenuItem = {
  id: number;
  name: string;
  price: number;
  description: string;
  image: string | null;
  is_soldout: boolean;
  /** 주문 가능 최대 수량(재고) */
  stock?: number;
};

export type ApiSetItem = ApiMenuItem & {
  origin_price: number;
  discount_rate?: number;
  menu_items?: { menu_id: number; quantity: number }[];
};

export type MenuListApiResponse = {
  message: string;
  booth_id: number;
  booth_name: string;
  seat_type: 'table' | 'person' | 'NO' | string;
  data: {
    FEE: ApiMenuItem[];
    SET: ApiSetItem[];
    MENU: ApiMenuItem[];
    DRINK: ApiMenuItem[];
  };
  table_info: {
    table_number: number;
    table_usage_id: number;
  };
};

export const MenuListService = {
  fetchAllMenus: async (boothId: string): Promise<MenuListApiResponse> => {
    const tableNum = localStorage.getItem('tableNum') || '';

    const res = await instance.get<MenuListApiResponse>(
      `/api/v3/django/booth/${boothId}/menu-list/?table_num=${tableNum}`,
    );
    return res.data;
  },
};
