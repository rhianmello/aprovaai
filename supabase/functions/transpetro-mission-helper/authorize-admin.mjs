export async function authorizeAdmin(request, client) {
  const match=/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization')||'');
  if(!match)return {error:'authentication required',status:401};
  try {
    const {data,error}=await client.auth.getUser(match[1]);
    if(error||!data?.user?.id)return {error:'invalid session',status:401};
    const profile=await client.from('profiles').select('role,active').eq('id',data.user.id).maybeSingle();
    if(profile.error)return {error:'authorization unavailable',status:503};
    if(profile.data?.role!=='admin'||profile.data?.active!==true)return {error:'administrator required',status:403};
    return {userId:data.user.id};
  } catch {
    return {error:'authorization unavailable',status:503};
  }
}

