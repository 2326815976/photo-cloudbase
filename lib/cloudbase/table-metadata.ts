export type PrimaryKeyKind = 'uuid' | 'auto' | 'string' | 'none';

export interface TableMetadata {
  name: string;
  columns: string[];
  primaryKey: string | null;
  primaryKeyKind: PrimaryKeyKind;
}

const metadataList: TableMetadata[] = [
  {
    name: 'users',
    columns: ['id', 'email', 'phone', 'password_hash', 'role', 'created_at', 'updated_at', 'deleted_at'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'user_sessions',
    columns: ['id', 'user_id', 'token_hash', 'expires_at', 'created_at', 'last_seen_at', 'user_agent', 'ip_address', 'is_revoked'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'password_reset_tokens',
    columns: ['id', 'user_id', 'token_hash', 'expires_at', 'used_at', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'profiles',
    columns: ['id', 'email', 'name', 'avatar', 'role', 'phone', 'wechat', 'payment_qr_code', 'created_at', 'last_active_at'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'about_settings',
    columns: [
      'id',
      'author_name',
      'phone',
      'wechat',
      'email',
      'donation_qr_code',
      'author_message',
      'created_at',
      'updated_at',
    ],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'user_active_logs',
    columns: ['user_id', 'active_date', 'created_at'],
    primaryKey: null,
    primaryKeyKind: 'none',
  },
  {
    name: 'analytics_daily',
    columns: [
      'date',
      'new_users_count',
      'active_users_count',
      'total_users_count',
      'admin_users_count',
      'total_albums_count',
      'new_albums_count',
      'expired_albums_count',
      'tipping_enabled_albums_count',
      'total_photos_count',
      'new_photos_count',
      'public_photos_count',
      'private_photos_count',
      'total_photo_views',
      'total_photo_likes',
      'total_photo_comments',
      'total_bookings_count',
      'new_bookings_count',
      'pending_bookings_count',
      'confirmed_bookings_count',
      'finished_bookings_count',
      'cancelled_bookings_count',
      'total_poses_count',
      'new_poses_count',
      'total_pose_tags_count',
      'total_pose_views',
    ],
    primaryKey: 'date',
    primaryKeyKind: 'string',
  },
  {
    name: 'poses',
    columns: ['id', 'image_url', 'storage_path', 'tags', 'view_count', 'created_at', 'rand_key'],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'pose_tags',
    columns: ['id', 'name', 'usage_count', 'sort_order', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'albums',
    columns: [
      'id',
      'access_key',
      'title',
      'root_folder_name',
      'cover_url',
      'welcome_letter',
      'recipient_name',
      'enable_tipping',
      'enable_welcome_letter',
      'donation_qr_code_url',
      'expires_at',
      'created_by',
      'created_at',
    ],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'album_folders',
    columns: ['id', 'album_id', 'name', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'album_photos',
    columns: [
      'id',
      'album_id',
      'folder_id',
      'url',
      'thumbnail_url',
      'preview_url',
      'original_url',
      'width',
      'height',
      'blurhash',
      'is_public',
      'view_count',
      'like_count',
      'rating',
      'created_at',
    ],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'photo_comments',
    columns: ['id', 'photo_id', 'user_id', 'nickname', 'content', 'is_admin_reply', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'photo_likes',
    columns: ['id', 'user_id', 'photo_id', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'user_album_bindings',
    columns: ['id', 'user_id', 'album_id', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'photo_views',
    columns: ['id', 'photo_id', 'user_id', 'session_id', 'viewed_at'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'booking_types',
    columns: ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at'],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'allowed_cities',
    columns: ['id', 'city_name', 'province', 'city_code', 'latitude', 'longitude', 'is_active', 'created_at', 'updated_at'],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'bookings',
    columns: [
      'id',
      'user_id',
      'type_id',
      'booking_date',
      'time_slot_start',
      'time_slot_end',
      'location',
      'latitude',
      'longitude',
      'city_name',
      'phone',
      'wechat',
      'notes',
      'status',
      'created_at',
      'updated_at',
    ],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
  {
    name: 'booking_blackouts',
    columns: ['id', 'date', 'reason', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'app_releases',
    columns: [
      'id',
      'version',
      'platform',
      'download_url',
      'storage_provider',
      'storage_file_id',
      'update_log',
      'force_update',
      'created_at',
    ],
    primaryKey: 'id',
    primaryKeyKind: 'auto',
  },
  {
    name: 'ip_registration_attempts',
    columns: ['id', 'ip_address', 'attempted_at', 'success', 'user_agent', 'created_at'],
    primaryKey: 'id',
    primaryKeyKind: 'uuid',
  },
];

const metadataMap = new Map<string, TableMetadata>(
  metadataList.map((item) => [item.name, item])
);

export function getTableMetadata(table: string): TableMetadata {
  const metadata = metadataMap.get(table);
  if (!metadata) {
    throw new Error(`不允许访问的数据表：${table}`);
  }
  return metadata;
}

export function isColumnAllowed(table: string, column: string): boolean {
  const metadata = getTableMetadata(table);
  return metadata.columns.includes(column);
}

export function assertColumnAllowed(table: string, column: string): string {
  if (!isColumnAllowed(table, column)) {
    throw new Error(`字段不允许访问：${table}.${column}`);
  }
  return column;
}

export function getAllowedTables(): string[] {
  return metadataList.map((item) => item.name);
}
