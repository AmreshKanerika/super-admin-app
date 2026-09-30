import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';

describe('Session refresh coordination', () => {
  it('shares one refresh token request between concurrent callers', fakeAsync(() => {
    const token = (seconds: number) => 'e30.' + btoa(JSON.stringify({ exp: Math.floor(Date.now()/1000) + seconds })) + '.test';
    const previous = localStorage.getItem('sa-session');
    localStorage.setItem('sa-session', JSON.stringify({ accessToken: token(10), refreshToken: 'test-refresh', idToken: token(600), loginAt: Date.now() }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    let first: boolean | undefined; let second: boolean | undefined;
    auth.ensureValidSession().then(value => first = value);
    auth.ensureValidSession().then(value => second = value);
    const request = http.expectOne(req => req.url.endsWith('/protocol/openid-connect/token'));
    request.flush({ access_token: token(600), refresh_token: 'next-test-refresh', id_token: token(600) });
    flushMicrotasks();
    expect(first).toBeTrue(); expect(second).toBeTrue();
    http.verify(); auth.endSession();
    if (previous === null) localStorage.removeItem('sa-session'); else localStorage.setItem('sa-session', previous);
  }));
});
