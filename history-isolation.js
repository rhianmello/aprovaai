(()=>{
  const rawGet=Storage.prototype.getItem;
  const rawSet=Storage.prototype.setItem;
  const rawRemove=Storage.prototype.removeItem;
  const keyPattern=/^(?:nospassa|aprovaai)_.*_history/;
  const scopedKey=key=>{
    if(!keyPattern.test(String(key)))return String(key);
    const user=window.__NP_AUTH_USER;
    const uid=user?.id;
    return uid?`${key}__user_${uid}`:String(key);
  };
  Storage.prototype.getItem=function(key){return rawGet.call(this,scopedKey(key))};
  Storage.prototype.setItem=function(key,value){return rawSet.call(this,scopedKey(key),value)};
  Storage.prototype.removeItem=function(key){return rawRemove.call(this,scopedKey(key))};
})();
