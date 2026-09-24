import assert from 'node:assert/strict';
import {authorizeAdmin} from '../supabase/functions/transpetro-mission-helper/authorize-admin.mjs';

const scenarios = [
  {name:'missing bearer',token:false,status:401},
  {name:'invalid session',invalid:true,status:401},
  {name:'student cannot elevate with user metadata',role:'student',active:true,status:403},
  {name:'inactive administrator',role:'admin',active:false,status:403},
  {name:'missing profile',missing:true,status:403},
  {name:'profile lookup failure',failure:true,status:503},
  {name:'active administrator',role:'admin',active:true,status:200},
];
for (const s of scenarios) {
  let authCalls=0,profileCalls=0;
  const client={
    auth:{getUser:async token=>{
      authCalls++;assert.equal(token,'test-session');
      return s.invalid?{error:new Error('invalid')}:{data:{user:{id:'test-user',user_metadata:{role:'admin'}}}};
    }},
    from:table=>{
      assert.equal(table,'profiles');profileCalls++;
      return {select:columns=>{
        assert.equal(columns,'role,active');
        return {eq:(column,id)=>{
          assert.equal(column,'id');assert.equal(id,'test-user');
          return {maybeSingle:async()=>s.failure?{error:new Error('unavailable')}:{data:s.missing?null:{role:s.role,active:s.active}}};
        }};
      }};
    },
  };
  const request=new Request('https://example.invalid/',{headers:s.token===false?{}:{Authorization:'Bearer test-session'}});
  const result=await authorizeAdmin(request,client);
  assert.equal(result.status||200,s.status,s.name);
  if(s.status===200)assert.equal(result.userId,'test-user');
  else assert.equal(result.userId,undefined,s.name);
  assert.equal(authCalls,s.token===false?0:1,s.name);
  assert.equal(profileCalls,s.token===false||s.invalid?0:1,s.name);
}
console.log('OK: 7 cenários de autorização administrativa');
