-- Yetki fonksiyonlarına authenticated için EXECUTE ve private şemasına USAGE.
--
-- İlk şemada bunlar geri alınmıştı; yanlış bir varsayıma dayanıyordu. RLS
-- politika ifadeleri politikanın sahibi adına değil SORGUYU ATAN KULLANICI
-- adına değerlendirilir, dolayısıyla kullanıcının fonksiyona EXECUTE yetkisi
-- olmadan her politika "permission denied for function" ile patlıyordu.
--
-- Güvenlik bu grant'tan değil, PostgREST'in yalnızca `public` şemasını dışa
-- açmasından geliyor: private.* hiçbir zaman RPC ile çağrılamaz.

grant usage on schema private to authenticated;

grant execute on function private.member_tenants()               to authenticated;
grant execute on function private.is_tenant_member(uuid)         to authenticated;
grant execute on function private.tenants_with(text)             to authenticated;
grant execute on function private.branches_with(text)            to authenticated;
grant execute on function private.resources_with(text)           to authenticated;
grant execute on function private.allows(text, uuid, uuid, uuid) to authenticated;
