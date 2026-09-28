export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          is_public: boolean
          kind: Database["public"]["Enums"]["coupon_kind"]
          max_discount_fcfa: number | null
          max_uses: number | null
          max_uses_per_customer: number
          min_order_fcfa: number
          restaurant_id: string | null
          starts_at: string | null
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          kind?: Database["public"]["Enums"]["coupon_kind"]
          max_discount_fcfa?: number | null
          max_uses?: number | null
          max_uses_per_customer?: number
          min_order_fcfa?: number
          restaurant_id?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          kind?: Database["public"]["Enums"]["coupon_kind"]
          max_discount_fcfa?: number | null
          max_uses?: number | null
          max_uses_per_customer?: number
          min_order_fcfa?: number
          restaurant_id?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          city_id: string
          created_at: string
          fee_fcfa: number
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          fee_fcfa?: number
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          fee_fcfa?: number
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_zones_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          menu_item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          menu_item_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          menu_item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_variants: {
        Row: {
          addon_ids: string[]
          created_at: string
          id: string
          is_available: boolean
          is_default: boolean
          kind: Database["public"]["Enums"]["variant_kind"]
          menu_item_id: string
          name: string
          price_fcfa: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          addon_ids?: string[]
          created_at?: string
          id?: string
          is_available?: boolean
          is_default?: boolean
          kind?: Database["public"]["Enums"]["variant_kind"]
          menu_item_id: string
          name: string
          price_fcfa: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          addon_ids?: string[]
          created_at?: string
          id?: string
          is_available?: boolean
          is_default?: boolean
          kind?: Database["public"]["Enums"]["variant_kind"]
          menu_item_id?: string
          name?: string
          price_fcfa?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_variants_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available_weekday: number | null
          base_price_fcfa: number
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          available_weekday?: number | null
          base_price_fcfa: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          available_weekday?: number | null
          base_price_fcfa?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          audience: string
          channel: string
          created_at: string
          event: string
          id: string
          last_error: string | null
          order_id: string | null
          payload: Json
          recipient: string | null
          restaurant_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          audience: string
          channel: string
          created_at?: string
          event: string
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          recipient?: string | null
          restaurant_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          audience?: string
          channel?: string
          created_at?: string
          event?: string
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          recipient?: string | null
          restaurant_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          order_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      option_groups: {
        Row: {
          applies_to_kind: Database["public"]["Enums"]["variant_kind"] | null
          created_at: string
          id: string
          max_select: number
          menu_item_id: string
          min_select: number
          name: string
          sort_order: number
          source_addon_id: string | null
          updated_at: string
        }
        Insert: {
          applies_to_kind?: Database["public"]["Enums"]["variant_kind"] | null
          created_at?: string
          id?: string
          max_select?: number
          menu_item_id: string
          min_select?: number
          name: string
          sort_order?: number
          source_addon_id?: string | null
          updated_at?: string
        }
        Update: {
          applies_to_kind?: Database["public"]["Enums"]["variant_kind"] | null
          created_at?: string
          id?: string
          max_select?: number
          menu_item_id?: string
          min_select?: number
          name?: string
          sort_order?: number
          source_addon_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_groups_source_addon_id_fkey"
            columns: ["source_addon_id"]
            isOneToOne: false
            referencedRelation: "restaurant_addons"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_available: boolean
          name: string
          price_delta_fcfa: number
          sort_order: number
          source_option_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_available?: boolean
          name: string
          price_delta_fcfa?: number
          sort_order?: number
          source_option_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_available?: boolean
          name?: string
          price_delta_fcfa?: number
          sort_order?: number
          source_option_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "options_source_option_id_fkey"
            columns: ["source_option_id"]
            isOneToOne: false
            referencedRelation: "restaurant_options"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_options: {
        Row: {
          created_at: string
          id: string
          name: string
          option_id: string | null
          order_item_id: string
          price_delta_fcfa: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          option_id?: string | null
          order_item_id: string
          price_delta_fcfa?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          option_id?: string | null
          order_item_id?: string
          price_delta_fcfa?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_options_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          line_total_fcfa: number
          menu_item_id: string | null
          note: string | null
          order_id: string
          quantity: number
          unit_price_fcfa: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          line_total_fcfa: number
          menu_item_id?: string | null
          note?: string | null
          order_id: string
          quantity?: number
          unit_price_fcfa: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          line_total_fcfa?: number
          menu_item_id?: string | null
          note?: string | null
          order_id?: string
          quantity?: number
          unit_price_fcfa?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "item_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string
          sender_name: string
          sender_role: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id: string
          sender_name: string
          sender_role: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          sender_name?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          commission_fcfa: number
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee_fcfa: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_zone_id: string | null
          discount_fcfa: number
          estimated_ready_at: string | null
          free_delivery_used: boolean
          id: string
          items_total_fcfa: number
          note: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          ready_at: string | null
          restaurant_id: string
          rider_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_fcfa: number
          updated_at: string
          wallet_used_fcfa: number
        }
        Insert: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          commission_fcfa?: number
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee_fcfa?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_zone_id?: string | null
          discount_fcfa?: number
          estimated_ready_at?: string | null
          free_delivery_used?: boolean
          id?: string
          items_total_fcfa?: number
          note?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: Database["public"]["Enums"]["payment_method"]
          picked_up_at?: string | null
          ready_at?: string | null
          restaurant_id: string
          rider_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_fcfa?: number
          updated_at?: string
          wallet_used_fcfa?: number
        }
        Update: {
          accepted_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          commission_fcfa?: number
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_fee_fcfa?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_zone_id?: string | null
          discount_fcfa?: number
          estimated_ready_at?: string | null
          free_delivery_used?: boolean
          id?: string
          items_total_fcfa?: number
          note?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_method?: Database["public"]["Enums"]["payment_method"]
          picked_up_at?: string | null
          ready_at?: string | null
          restaurant_id?: string
          rider_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_fcfa?: number
          updated_at?: string
          wallet_used_fcfa?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_fcfa: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string
          phone: string
          provider: string
          provider_correspondent: string | null
          provider_ref: string | null
          raw: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_fcfa: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id: string
          phone: string
          provider?: string
          provider_correspondent?: string | null
          provider_ref?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_fcfa?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id?: string
          phone?: string
          provider?: string
          provider_correspondent?: string | null
          provider_ref?: string | null
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          offers: boolean
          order_updates: boolean
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          offers?: boolean
          order_updates?: boolean
          platform?: string | null
          token: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          offers?: boolean
          order_updates?: boolean
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          code: string
          created_at: string
          id: string
          referee_id: string
          referrer_id: string
          restaurant_id: string
          rewarded_at: string | null
          rewarded_order_id: string | null
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referee_id: string
          referrer_id: string
          restaurant_id: string
          rewarded_at?: string | null
          rewarded_order_id?: string | null
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referee_id?: string
          referrer_id?: string
          restaurant_id?: string
          rewarded_at?: string | null
          rewarded_order_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_rewarded_order_id_fkey"
            columns: ["rewarded_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_addons: {
        Row: {
          created_at: string
          description: string | null
          id: string
          max_select: number
          min_select: number
          option_ids: string[]
          restaurant_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          max_select?: number
          min_select?: number
          option_ids?: string[]
          restaurant_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          max_select?: number
          min_select?: number
          option_ids?: string[]
          restaurant_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_addons_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_options: {
        Row: {
          created_at: string
          description: string | null
          id: string
          price_fcfa: number
          restaurant_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          price_fcfa?: number
          restaurant_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          price_fcfa?: number
          restaurant_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_options_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accepts_delivery: boolean
          accepts_takeaway: boolean
          address: string | null
          brand_color: string
          city: string
          closes_at: string | null
          commission_rate: number
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_temporarily_closed: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          max_active_orders_per_phone: number
          max_orders_per_phone_hour: number
          min_order_fcfa: number
          name: string
          opens_at: string | null
          phone: string | null
          slug: string
          tagline: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          accepts_delivery?: boolean
          accepts_takeaway?: boolean
          address?: string | null
          brand_color?: string
          city?: string
          closes_at?: string | null
          commission_rate?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_temporarily_closed?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_active_orders_per_phone?: number
          max_orders_per_phone_hour?: number
          min_order_fcfa?: number
          name: string
          opens_at?: string | null
          phone?: string | null
          slug: string
          tagline?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          accepts_delivery?: boolean
          accepts_takeaway?: boolean
          address?: string | null
          brand_color?: string
          city?: string
          closes_at?: string | null
          commission_rate?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_temporarily_closed?: boolean
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          max_active_orders_per_phone?: number
          max_orders_per_phone_hour?: number
          min_order_fcfa?: number
          name?: string
          opens_at?: string | null
          phone?: string | null
          slug?: string
          tagline?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      reward_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          order_id: string | null
          reason: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          note?: string | null
          order_id?: string | null
          reason: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          order_id?: string | null
          reason?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_ledger_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          latitude: number
          longitude: number
          recorded_at: string
          rider_id: string
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          latitude: number
          longitude: number
          recorded_at?: string
          rider_id: string
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          latitude?: number
          longitude?: number
          recorded_at?: string
          rider_id?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_locations_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: true
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
        ]
      }
      riders: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          is_platform_fleet: boolean
          phone: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["rider_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          is_platform_fleet?: boolean
          phone?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["rider_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_platform_fleet?: boolean
          phone?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["rider_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "riders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_order: {
        Args: { p_minutes?: number; p_order_id: string }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          commission_fcfa: number
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee_fcfa: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_zone_id: string | null
          discount_fcfa: number
          estimated_ready_at: string | null
          free_delivery_used: boolean
          id: string
          items_total_fcfa: number
          note: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          ready_at: string | null
          restaurant_id: string
          rider_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_fcfa: number
          updated_at: string
          wallet_used_fcfa: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_assign_staff: {
        Args: {
          p_full_name?: string
          p_phone?: string
          p_restaurant_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      admin_find_user: { Args: { p_email: string }; Returns: string }
      admin_grant_reward: {
        Args: {
          p_amount: number
          p_kind: string
          p_note?: string
          p_reason?: string
          p_user: string
        }
        Returns: Json
      }
      admin_list_customers: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: Json
      }
      admin_list_staff: {
        Args: { p_restaurant_id?: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          phone: string
          restaurant_id: string
          restaurant_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_my_access: { Args: never; Returns: Json }
      admin_remove_staff: {
        Args: {
          p_restaurant_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      admin_save_food: { Args: { p: Json }; Returns: string }
      admin_sync_library: {
        Args: { p_restaurant_id: string }
        Returns: undefined
      }
      advance_order_status: {
        Args: {
          p_cancel_reason?: string
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          commission_fcfa: number
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee_fcfa: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_zone_id: string | null
          discount_fcfa: number
          estimated_ready_at: string | null
          free_delivery_used: boolean
          id: string
          items_total_fcfa: number
          note: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          ready_at: string | null
          restaurant_id: string
          rider_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_fcfa: number
          updated_at: string
          wallet_used_fcfa: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_referral_code: { Args: { p_code: string }; Returns: Json }
      bouff_restaurant_id: { Args: never; Returns: string }
      cancel_my_order: {
        Args: { p_order_number: string; p_phone?: string }
        Returns: Json
      }
      check_coupon: {
        Args: {
          p_code: string
          p_phone?: string
          p_restaurant: string
          p_subtotal: number
        }
        Returns: Json
      }
      check_referral_code: { Args: { p_code: string }; Returns: boolean }
      claim_notifications: {
        Args: { p_limit?: number; p_token: string }
        Returns: Json
      }
      claim_order: {
        Args: { p_order_id: string }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          commission_fcfa: number
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee_fcfa: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_zone_id: string | null
          discount_fcfa: number
          estimated_ready_at: string | null
          free_delivery_used: boolean
          id: string
          items_total_fcfa: number
          note: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          ready_at: string | null
          restaurant_id: string
          rider_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_fcfa: number
          updated_at: string
          wallet_used_fcfa: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      coupon_quote: {
        Args: {
          p_code: string
          p_exclude_order?: string
          p_phone?: string
          p_restaurant: string
          p_subtotal: number
        }
        Returns: Json
      }
      email_exists: { Args: { p_email: string }; Returns: boolean }
      ensure_referral_code: { Args: { p_user: string }; Returns: string }
      is_restaurant_open: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      list_order_messages: {
        Args: { p_order: string; p_phone?: string }
        Returns: {
          body: string
          created_at: string
          id: string
          order_id: string
          sender_name: string
          sender_role: string
        }[]
        SetofOptions: {
          from: "*"
          to: "order_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mark_notification: {
        Args: {
          p_error?: string
          p_id: string
          p_status: string
          p_token: string
        }
        Returns: undefined
      }
      my_rewards: { Args: never; Returns: Json }
      order_rider_location: {
        Args: { p_order: string; p_phone?: string }
        Returns: Json
      }
      order_route: { Args: { p_order: string; p_phone: string }; Returns: Json }
      payment_order_lookup: {
        Args: { p_order_number: string; p_phone: string; p_token: string }
        Returns: Json
      }
      place_order: {
        Args: {
          p_coupon_code?: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_address?: string
          p_delivery_zone_id?: string
          p_items: Json
          p_note?: string
          p_order_type: Database["public"]["Enums"]["order_type"]
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_restaurant_id: string
          p_use_wallet?: boolean
        }
        Returns: Json
      }
      place_order_base: {
        Args: {
          p_coupon_code?: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_address?: string
          p_delivery_zone_id?: string
          p_items: Json
          p_note?: string
          p_order_type: Database["public"]["Enums"]["order_type"]
          p_payment_method?: Database["public"]["Enums"]["payment_method"]
          p_restaurant_id: string
        }
        Returns: Json
      }
      platform_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      points_catalog: { Args: never; Returns: Json }
      public_coupons: {
        Args: { p_restaurant: string }
        Returns: {
          code: string
          ends_at: string
          kind: Database["public"]["Enums"]["coupon_kind"]
          max_discount_fcfa: number
          min_order_fcfa: number
          title: string
          value: number
        }[]
      }
      record_payment_intent: {
        Args: {
          p_amount: number
          p_correspondent?: string
          p_order_id: string
          p_phone: string
          p_provider?: string
          p_provider_ref: string
          p_token: string
        }
        Returns: string
      }
      redeem_points: { Args: { p_reward: string }; Returns: Json }
      register_push_token: {
        Args: { p_platform?: string; p_token: string }
        Returns: Json
      }
      restaurant_stats: {
        Args: { p_from?: string; p_restaurant_id: string; p_to?: string }
        Returns: Json
      }
      reward_balance: {
        Args: { p_kind: string; p_restaurant: string; p_user: string }
        Returns: number
      }
      rewards_quote: {
        Args: {
          p_delivery_fee: number
          p_items_after_discount: number
          p_restaurant: string
          p_use_wallet?: boolean
        }
        Returns: Json
      }
      rider_advance_order: {
        Args: {
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: {
          accepted_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          commission_fcfa: number
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_fee_fcfa: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_zone_id: string | null
          discount_fcfa: number
          estimated_ready_at: string | null
          free_delivery_used: boolean
          id: string
          items_total_fcfa: number
          note: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          payment_method: Database["public"]["Enums"]["payment_method"]
          picked_up_at: string | null
          ready_at: string | null
          restaurant_id: string
          rider_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_fcfa: number
          updated_at: string
          wallet_used_fcfa: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_order_message: {
        Args: { p_body: string; p_order: string; p_phone?: string }
        Returns: {
          body: string
          created_at: string
          id: string
          order_id: string
          sender_name: string
          sender_role: string
        }
        SetofOptions: {
          from: "*"
          to: "order_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_item_availability: {
        Args: { p_available: boolean; p_menu_item_id: string }
        Returns: {
          available_weekday: number | null
          base_price_fcfa: number
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "menu_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_order_location: {
        Args: { p_lat: number; p_lng: number; p_order: string; p_phone: string }
        Returns: undefined
      }
      set_push_preferences: {
        Args: { p_offers: boolean; p_order_updates: boolean }
        Returns: Json
      }
      set_restaurant_closed: {
        Args: { p_closed: boolean; p_restaurant_id: string }
        Returns: {
          accepts_delivery: boolean
          accepts_takeaway: boolean
          address: string | null
          brand_color: string
          city: string
          closes_at: string | null
          commission_rate: number
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_temporarily_closed: boolean
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          max_active_orders_per_phone: number
          max_orders_per_phone_hour: number
          min_order_fcfa: number
          name: string
          opens_at: string | null
          phone: string | null
          slug: string
          tagline: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "restaurants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_rider_status: {
        Args: { p_status: Database["public"]["Enums"]["rider_status"] }
        Returns: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          is_platform_fleet: boolean
          phone: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["rider_status"]
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "riders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_variant_availability: {
        Args: { p_available: boolean; p_variant_id: string }
        Returns: {
          addon_ids: string[]
          created_at: string
          id: string
          is_available: boolean
          is_default: boolean
          kind: Database["public"]["Enums"]["variant_kind"]
          menu_item_id: string
          name: string
          price_fcfa: number
          sort_order: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "item_variants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      track_order: {
        Args: { p_order_number: string; p_phone: string }
        Returns: Json
      }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      update_payment_status: {
        Args: {
          p_failure_reason?: string
          p_provider_ref: string
          p_raw?: Json
          p_status: string
          p_token: string
        }
        Returns: undefined
      }
      update_rider_location: {
        Args: {
          p_accuracy?: number
          p_heading?: number
          p_latitude: number
          p_longitude: number
          p_speed?: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "client"
        | "kitchen"
        | "rider"
        | "restaurant_admin"
        | "super_admin"
      coupon_kind: "percent" | "fixed"
      order_status:
        | "received"
        | "in_kitchen"
        | "ready"
        | "on_the_way"
        | "delivered"
        | "cancelled"
      order_type: "takeaway" | "delivery"
      payment_method: "cash" | "mobile_money" | "card"
      rider_status: "offline" | "available" | "on_delivery"
      variant_kind: "solo" | "fries" | "combo" | "single"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "client",
        "kitchen",
        "rider",
        "restaurant_admin",
        "super_admin",
      ],
      coupon_kind: ["percent", "fixed"],
      order_status: [
        "received",
        "in_kitchen",
        "ready",
        "on_the_way",
        "delivered",
        "cancelled",
      ],
      order_type: ["takeaway", "delivery"],
      payment_method: ["cash", "mobile_money", "card"],
      rider_status: ["offline", "available", "on_delivery"],
      variant_kind: ["solo", "fries", "combo", "single"],
    },
  },
} as const
